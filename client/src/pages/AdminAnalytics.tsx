import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Helmet } from 'react-helmet-async';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { getQueryFn } from '@/lib/queryClient';
import {
  buildFunnel, downloadCsv, formatGbp, formatPct, presetRange, toCsv, type RangePreset,
} from '@/lib/adminAnalytics';

interface Summary {
  signups: number; trialStarts: number; trialConversions: number; trialToPaidPct: number; paidConversions: number;
  mrrPence: number; arrPence: number; activePaid: number; churnPct: number;
  netMrrMovement: { new: number; expansion: number; contraction: number; churn: number };
  dau: number; wau: number; mau: number; aiCostPence: number; aiCostToMrrPct: number;
}
interface Point { date: string; value: number; byTier?: Record<string, number> }
interface Tiers { tiers: Array<{ tier: string; count: number; trialing: number; mrrPence: number }>; elliottAddon: { count: number; mrrPence: number }; totalUsers: number }
interface AiRow { userId: string; email: string | null; tier: string | null; tokens: number; calls: number; costPence: number; revenuePence: number; marginPence: number; flagged: boolean }

const COLORS = ['#64748b', '#00c4b4', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];
const SORTS = ['cost', 'margin', 'tokens', 'calls', 'revenue'] as const;

function useAdminQuery<T>(path: string, enabled: boolean) {
  return useQuery<T>({ queryKey: [path], queryFn: getQueryFn({ on401: 'throw', url: path }), enabled, staleTime: 60000 });
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardContent className="p-4">
        <div className="text-xs text-gray-400">{label}</div>
        <div className="text-2xl font-semibold text-white">{value}</div>
        {sub && <div className="text-xs text-gray-500">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function AdminAnalytics() {
  const [, setLocation] = useLocation();
  const { isAdmin, isLoading: authLoading } = useCryptoAuth();
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [sort, setSort] = useState<(typeof SORTS)[number]>('cost');

  useEffect(() => {
    if (!authLoading && !isAdmin) setLocation('/crypto/account');
  }, [authLoading, isAdmin, setLocation]);

  const range = useMemo(() => {
    if (preset === 'custom' && custom.from && custom.to) {
      return { from: new Date(custom.from).toISOString(), to: new Date(custom.to + 'T23:59:59Z').toISOString() };
    }
    return presetRange(preset === 'custom' ? '30d' : preset);
    // Recompute only when the selection changes, not every render.
  }, [preset, custom.from, custom.to]);
  const qs = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  const on = isAdmin && !authLoading;

  const summary = useAdminQuery<Summary>(`/api/admin/analytics/summary?${qs}`, on);
  const mrr = useAdminQuery<Point[]>(`/api/admin/analytics/timeseries?metric=mrr&interval=day&${qs}`, on);
  const dau = useAdminQuery<Point[]>(`/api/admin/analytics/timeseries?metric=active&interval=day&${qs}`, on);
  const wau = useAdminQuery<Point[]>(`/api/admin/analytics/timeseries?metric=active&interval=week&${qs}`, on);
  const tiers = useAdminQuery<Tiers>(`/api/admin/analytics/tiers`, on);
  const ai = useAdminQuery<{ rows: AiRow[]; usdGbpRate: number }>(`/api/admin/analytics/ai-cost?limit=50&sort=${sort}&${qs}`, on);

  if (authLoading || !isAdmin) return null;
  const s = summary.data;

  const movement = s ? [
    { name: 'New', value: s.netMrrMovement.new / 100 },
    { name: 'Expansion', value: s.netMrrMovement.expansion / 100 },
    { name: 'Contraction', value: s.netMrrMovement.contraction / 100 },
    { name: 'Churn', value: s.netMrrMovement.churn / 100 },
  ] : [];
  const tierData = (tiers.data?.tiers ?? []).filter((t) => t.count > 0).map((t) => ({ name: t.tier, value: t.count }));
  const funnel = s ? buildFunnel(s.signups, s.trialStarts, s.paidConversions) : [];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  const exportCsv = () => {
    const rows = (ai.data?.rows ?? []).map((r) => ({
      user_id: r.userId, email: r.email ?? '', tier: r.tier ?? '', calls: r.calls, tokens: r.tokens,
      ai_cost_gbp: (r.costPence / 100).toFixed(2), revenue_gbp: (r.revenuePence / 100).toFixed(2),
      margin_gbp: (r.marginPence / 100).toFixed(2), flagged: r.flagged ? 'yes' : 'no',
    }));
    downloadCsv(`beartec-ai-cost-${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`,
      toCsv(rows, ['user_id', 'email', 'tier', 'calls', 'tokens', 'ai_cost_gbp', 'revenue_gbp', 'margin_gbp', 'flagged']));
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-6 space-y-6">
      <Helmet><title>Admin analytics | BearTec</title><meta name="robots" content="noindex" /></Helmet>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Business analytics</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(['7d', '30d', '90d', 'custom'] as const).map((p) => (
            <Button key={p} size="sm" variant={preset === p ? 'default' : 'outline'} onClick={() => setPreset(p)}>{p}</Button>
          ))}
          {preset === 'custom' && (
            <>
              <Input type="date" className="w-40" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From" />
              <Input type="date" className="w-40" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To" />
            </>
          )}
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!ai.data?.rows?.length}>Export CSV</Button>
        </div>
      </div>

      {summary.isError && <div className="text-red-400">Could not load analytics.</div>}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="MRR" value={s ? formatGbp(s.mrrPence) : '–'} sub={s ? `ARR ${formatGbp(s.arrPence)}` : undefined} />
        <Kpi label="Active paid" value={s ? String(s.activePaid) : '–'} />
        <Kpi label="Trial → paid" value={s ? formatPct(s.trialToPaidPct) : '–'} sub={s ? `${s.trialConversions}/${s.trialStarts} trials` : undefined} />
        <Kpi label="Churn" value={s ? formatPct(s.churnPct) : '–'} />
        <Kpi label="MAU" value={s ? String(s.mau) : '–'} sub={s ? `DAU ${s.dau} · WAU ${s.wau}` : undefined} />
        <Kpi label="AI cost / MRR" value={s ? formatPct(s.aiCostToMrrPct) : '–'} sub={s ? `${formatGbp(s.aiCostPence)} in range` : undefined} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-slate-800 border-slate-700 md:col-span-2">
          <CardHeader><CardTitle className="text-base">MRR (£)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={(mrr.data ?? []).map((p) => ({ date: p.date, mrr: p.value / 100 }))}>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip formatter={(v: number) => formatGbp(v * 100)} />
                <Line type="monotone" dataKey="mrr" stroke="#00c4b4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader><CardTitle className="text-base">MRR movement (£)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={movement}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip formatter={(v: number) => formatGbp(v * 100)} />
                <Bar dataKey="value">{movement.map((m, i) => <Cell key={m.name} fill={m.value < 0 ? '#ef4444' : ['#10b981', '#3b82f6'][i % 2]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader><CardTitle className="text-base">Sign-up → trial → paid</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {funnel.map((f) => (
              <div key={f.label}>
                <div className="flex justify-between text-sm"><span>{f.label}</span>
                  <span>{f.value}{f.pctOfPrev !== null ? ` (${f.pctOfPrev}%)` : ''}</span></div>
                <div className="h-2 bg-slate-700 rounded"><div className="h-2 bg-[#00c4b4] rounded" style={{ width: `${(f.value / funnelMax) * 100}%` }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader><CardTitle className="text-base">Tier mix</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tierData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {tierData.map((t, i) => <Cell key={t.name} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
            {tiers.data && <div className="text-xs text-gray-400">Elliott add-on: {tiers.data.elliottAddon.count} users</div>}
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader><CardTitle className="text-base">Active users</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mergeActive(dau.data ?? [], wau.data ?? [])}>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                <Tooltip /><Legend />
                <Line type="monotone" dataKey="dau" name="DAU" stroke="#00c4b4" dot={false} />
                <Line type="stepAfter" dataKey="wau" name="WAU" stroke="#8b5cf6" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">AI cost per user</CardTitle>
          <div className="flex gap-1">
            {SORTS.map((k) => <Button key={k} size="sm" variant={sort === k ? 'default' : 'outline'} onClick={() => setSort(k)}>{k}</Button>)}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-400 text-left">
              <tr><th className="py-1">User</th><th>Tier</th><th className="text-right">Calls</th><th className="text-right">Tokens</th>
                <th className="text-right">AI cost</th><th className="text-right">Revenue/mo</th><th className="text-right">Margin</th></tr>
            </thead>
            <tbody>
              {(ai.data?.rows ?? []).map((r) => (
                <tr key={r.userId} className={r.flagged ? 'text-amber-300' : ''}>
                  <td className="py-1">{r.email ?? r.userId}{r.flagged ? ' ⚠' : ''}</td><td>{r.tier}</td>
                  <td className="text-right">{r.calls}</td><td className="text-right">{r.tokens.toLocaleString('en-GB')}</td>
                  <td className="text-right">{formatGbp(r.costPence)}</td><td className="text-right">{formatGbp(r.revenuePence)}</td>
                  <td className={`text-right ${r.marginPence < 0 ? 'text-red-400' : ''}`}>{formatGbp(r.marginPence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ai.data && <div className="text-xs text-gray-500 mt-2">AI cost converted from USD at {ai.data.usdGbpRate} GBP/USD. ⚠ = AI cost over 50% of revenue.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function mergeActive(dau: Point[], wau: Point[]) {
  const w = new Map(wau.map((p) => [p.date, p.value]));
  return dau.map((p) => ({ date: p.date, dau: p.value, wau: w.get(p.date) ?? null }));
}
