import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import {
  Users,
  RefreshCw,
  Gift,
  Key,
  ChevronRight,
  Search,
  Wrench,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface AdminUser {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: string | null;
  tier: string | null;
  hasElliottAddon: boolean | null;
  aiCredits: number | null;
  elliottAiCredits: number | null;
  bonusAiCredits: number | null;
  bonusElliottCredits: number | null;
  customToolAccess: string[] | null;
  subscriptionStatus: string | null;
}

const TIER_OPTIONS = ['free', 'beginner', 'intermediate', 'pro', 'elite'] as const;

const ALL_CUSTOM_TOOLS = [
  { id: 'liquidity_sweep', label: 'Liquidity Sweep' },
  { id: 'auto_fib', label: 'Auto Fibonacci' },
  { id: 'elliott_wave', label: 'Elliott Wave' },
  { id: 'order_block', label: 'Order Block' },
  { id: 'fvg', label: 'Fair Value Gap' },
  { id: 'bos', label: 'Break of Structure' },
  { id: 'supertrend', label: 'SuperTrend' },
  { id: 'vwap_advanced', label: 'Advanced VWAP' },
  { id: 'ai_trade', label: 'AI Trade Signals' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function tierColor(tier: string | null) {
  switch (tier) {
    case 'elite': return 'bg-yellow-500 text-black';
    case 'pro': return 'bg-purple-500 text-white';
    case 'intermediate': return 'bg-blue-500 text-white';
    case 'beginner': return 'bg-green-600 text-white';
    default: return 'bg-slate-600 text-white';
  }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function BonusCreditsDialog({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const [bonusAi, setBonusAi] = useState('0');
  const [bonusElliott, setBonusElliott] = useState('0');
  const { toast } = useToast();
  const qc = useQueryClient();
  const { getToken } = useCryptoAuth();

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${user.userId}/bonus-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ bonusAi: Number(bonusAi), bonusElliott: Number(bonusElliott) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: () => {
      toast({ title: 'Bonus credits added', description: `Added to ${user.email}` });
      qc.invalidateQueries({ queryKey: ['/api/admin/users'] });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <Card className="bg-slate-800 border-slate-600 w-full max-w-sm p-2">
        <CardHeader>
          <CardTitle className="text-white text-lg">Add Bonus Credits</CardTitle>
          <p className="text-slate-400 text-sm">{user.email}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-300">Bonus AI Credits</Label>
            <Input
              type="number"
              min="0"
              value={bonusAi}
              onChange={e => setBonusAi(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-slate-300">Bonus Elliott Credits</Label>
            <Input
              type="number"
              min="0"
              value={bonusElliott}
              onChange={e => setBonusElliott(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white mt-1"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving…' : 'Add Credits'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CustomAccessDialog({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(user.customToolAccess ?? []);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { getToken } = useCryptoAuth();

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${user.userId}/custom-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tools: selected }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: () => {
      toast({ title: 'Custom access updated', description: user.email });
      qc.invalidateQueries({ queryKey: ['/api/admin/users'] });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <Card className="bg-slate-800 border-slate-600 w-full max-w-sm p-2">
        <CardHeader>
          <CardTitle className="text-white text-lg">Custom Tool Access</CardTitle>
          <p className="text-slate-400 text-sm">{user.email}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {ALL_CUSTOM_TOOLS.map(tool => (
            <div key={tool.id} className="flex items-center justify-between py-1">
              <Label className="text-slate-300 cursor-pointer" htmlFor={`ct-${tool.id}`}>{tool.label}</Label>
              <Switch
                id={`ct-${tool.id}`}
                checked={selected.includes(tool.id)}
                onCheckedChange={() => toggle(tool.id)}
              />
            </div>
          ))}
          <div className="flex gap-2 pt-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── UserRow ──────────────────────────────────────────────────────────────────

function UserRow({ user }: { user: AdminUser }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { getToken } = useCryptoAuth();
  const [showBonus, setShowBonus] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const authHeaders = async () => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const tierMutation = useMutation({
    mutationFn: async (tier: string) => {
      const res = await fetch(`/api/admin/users/${user.userId}/tier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...await authHeaders() },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: (_, tier) => {
      toast({ title: 'Tier updated', description: `${user.email} → ${tier}` });
      qc.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const elliottMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`/api/admin/users/${user.userId}/elliott-addon`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...await authHeaders() },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: (_, enabled) => {
      toast({ title: `Elliott add-on ${enabled ? 'enabled' : 'disabled'}`, description: user.email });
      qc.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/users/${user.userId}/reset-credits`, {
        method: 'POST',
        headers: { ...await authHeaders() },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    },
    onSuccess: () => {
      toast({ title: 'Credits reset', description: user.email });
      qc.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/users/${user.userId}/send-password-reset`, {
        method: 'POST',
        headers: { ...await authHeaders() },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      return res.json() as Promise<{ token: string; url?: string }>;
    },
    onSuccess: (data) => {
      const link = data.url || data.token;
      navigator.clipboard.writeText(link).then(
        () => toast({
          title: 'Reset link generated',
          description: 'The one-time sign-in link has been copied to your clipboard.',
        }),
        () => toast({
          title: 'Reset link generated',
          description: `Copy this link manually: ${link}`,
        }),
      );
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  const aiTotal = (user.aiCredits ?? 0) + (user.bonusAiCredits ?? 0);
  const elliottTotal = (user.elliottAiCredits ?? 0) + (user.bonusElliottCredits ?? 0);

  return (
    <>
      <tr className="border-b border-slate-700 hover:bg-slate-800/50">
        <td className="py-3 px-4">
          <div className="font-medium text-white text-sm">{displayName}</div>
          <div className="text-xs text-slate-400">{user.email}</div>
        </td>
        <td className="py-3 px-4">
          <Select value={user.tier ?? 'free'} onValueChange={t => tierMutation.mutate(t)}>
            <SelectTrigger className="w-32 h-8 bg-slate-700 border-slate-600 text-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIER_OPTIONS.map(t => (
                <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className="py-3 px-4">
          <Switch
            checked={user.hasElliottAddon ?? false}
            onCheckedChange={v => elliottMutation.mutate(v)}
            disabled={elliottMutation.isPending}
          />
        </td>
        <td className="py-3 px-4 text-sm text-slate-300">
          <div>AI: {aiTotal} {(user.bonusAiCredits ?? 0) > 0 && <span className="text-green-400 text-xs">(+{user.bonusAiCredits} bonus)</span>}</div>
          <div>EW: {elliottTotal} {(user.bonusElliottCredits ?? 0) > 0 && <span className="text-green-400 text-xs">(+{user.bonusElliottCredits} bonus)</span>}</div>
        </td>
        <td className="py-3 px-4">
          {(user.customToolAccess?.length ?? 0) > 0 ? (
            <Badge className="bg-indigo-600 text-white text-xs">{user.customToolAccess?.length} tools</Badge>
          ) : (
            <span className="text-slate-500 text-xs">—</span>
          )}
        </td>
        <td className="py-3 px-4">
          <div className="flex gap-1 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-slate-600 text-slate-300 hover:text-white"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              title="Reset monthly credits"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-slate-600 text-slate-300 hover:text-white"
              onClick={() => setShowBonus(true)}
              title="Add bonus credits"
            >
              <Gift className="w-3 h-3 mr-1" />
              Bonus
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-slate-600 text-slate-300 hover:text-white"
              onClick={() => setShowCustom(true)}
              title="Custom tool access"
            >
              <Wrench className="w-3 h-3 mr-1" />
              Tools
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-slate-600 text-slate-300 hover:text-white"
              onClick={() => passwordMutation.mutate()}
              disabled={passwordMutation.isPending}
              title="Generate one-time sign-in link"
            >
              <Key className="w-3 h-3 mr-1" />
              Reset PW
            </Button>
          </div>
        </td>
      </tr>

      {showBonus && <BonusCreditsDialog user={user} onClose={() => setShowBonus(false)} />}
      {showCustom && <CustomAccessDialog user={user} onClose={() => setShowCustom(false)} />}
    </>
  );
}

// ── AdminPanel page ──────────────────────────────────────────────────────────

export default function AdminPanel() {
  const [, setLocation] = useLocation();
  const { isAdmin, isLoading: authLoading } = useCryptoAuth();
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  const { data: users = [], isLoading, refetch } = useQuery<AdminUser[]>({
    queryKey: ['/api/admin/users'],
    enabled: isAdmin,
    staleTime: 30_000,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Loading…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Card className="bg-slate-800 border-red-500 p-8">
          <CardTitle className="text-red-400 text-xl mb-4">Access Denied</CardTitle>
          <p className="text-gray-400 mb-4">This page is only accessible to admins.</p>
          <Button onClick={() => setLocation('/crypto/account')}>Return to Account</Button>
        </Card>
      </div>
    );
  }

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-6">
      <Helmet>
        <title>Admin Panel | BearTec</title>
      </Helmet>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white"
            onClick={() => setLocation('/crypto/account')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-purple-400" />
            <h1 className="text-2xl font-bold text-purple-300">Admin Panel</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              className="border-slate-600 text-slate-300"
              onClick={() => setLocation('/admin')}
            >
              <ChevronRight className="w-4 h-4 mr-1" />
              Analytics Dashboard
            </Button>
          </div>
        </div>

        <Tabs defaultValue="users">
          <TabsList className="bg-slate-800 border border-slate-700 mb-6">
            <TabsTrigger value="users" className="data-[state=active]:bg-slate-700">
              <Users className="w-4 h-4 mr-2" />
              Users ({users.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-400" />
                    User Management
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                      <Input
                        placeholder="Search users…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-8 bg-slate-700 border-slate-600 text-white w-56 h-9"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-600 text-slate-300 h-9"
                      onClick={() => refetch()}
                      disabled={isLoading}
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {isLoading ? (
                  <div className="py-12 text-center text-slate-400">Loading users…</div>
                ) : filtered.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">No users found</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                        <th className="py-2 px-4 text-left font-medium">User</th>
                        <th className="py-2 px-4 text-left font-medium">Tier</th>
                        <th className="py-2 px-4 text-left font-medium">Elliott</th>
                        <th className="py-2 px-4 text-left font-medium">Credits</th>
                        <th className="py-2 px-4 text-left font-medium">Custom Tools</th>
                        <th className="py-2 px-4 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => (
                        <UserRow key={u.userId} user={u} />
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
