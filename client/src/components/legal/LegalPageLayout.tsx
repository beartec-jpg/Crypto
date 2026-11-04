// Copyright (c) 2026 BEARTEC LTD. All rights reserved.
import type { ReactNode } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';

export function LegalPageLayout({ title, icon, lastUpdated, children }: {
  title: string; icon: ReactNode; lastUpdated: string; children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white p-6">
      <div className="max-w-[1200px] mx-auto space-y-6">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <img src={bearTecLogoNew} alt="BearTec Logo" className="h-[140px] w-auto object-contain cursor-pointer" />
          </Link>
        </div>
        <Link href="/">
          <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>
        <div className="flex items-center gap-3 mb-6">
          {icon}
          <h1 className="text-3xl font-bold">{title}</h1>
        </div>
        <p className="text-gray-400 text-sm mb-8">Last updated: {lastUpdated}</p>
        <div className="space-y-6">{children}</div>
        <div className="border-t border-[#2a2e39] pt-6 mt-8">
          <div className="flex flex-wrap justify-center gap-4">
            {[['/terms', 'Terms of Service'], ['/privacy', 'Privacy Policy'], ['/pricing', 'Subscriptions'], ['/contact', 'Contact']].map(([href, label]) => (
              <Link key={href} href={href}>
                <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]">{label}</Button>
              </Link>
            ))}
          </div>
          <div className="text-center text-sm text-gray-500 mt-4">
            © 2026 BEARTEC LTD (17166952). For educational and informational purposes only. Not financial advice.
          </div>
        </div>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="bg-[#1a1a1a] border-[#2a2e39]">
      <CardHeader><CardTitle className="text-xl text-white">{title}</CardTitle></CardHeader>
      <CardContent className="text-gray-300 space-y-3 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

export function LegalTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>{head.map((h) => <th key={h} className="text-left p-2 border-b border-[#2a2e39] text-white">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className="p-2 border-b border-[#2a2e39] align-top">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Placeholder that must be completed before publication. */
export function TBC({ children }: { children: ReactNode }) {
  return <span className="bg-yellow-500/20 text-yellow-300 px-1 rounded">[TBC: {children}]</span>;
}

export const CONTACT_EMAIL = 'beartec@beartec.uk';
export const COMPANY_DETAILS =
  'BEARTEC LTD, a company registered in England and Wales (company number 17166952), registered office 33 Salt Works Lane, Weston, Stafford, England, ST18 0LW';
