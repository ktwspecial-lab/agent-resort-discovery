'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Award, Bot, Check, Copy, Crown, Palmtree, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Passport = {
  agent: { id: string; name: string; ownerName: string; title: string; stars: number; palmPoints: number; tripStatus: string; checkedOutAt: string | null; industry: string | null; verificationBadge: string | null; prestigeStatus: string | null; organization: string | null };
  activities: { activityKey: string; stars: number; palmPoints: number; badge: string | null }[];
};

const labels: Record<string, string> = { poolside_pitch: 'Poolside Pitch', prompt_surfing: 'Prompt Surfing', sunset_roast: 'Sunset Roast' };

export default function PassportClient({ id }: { id: string }) {
  const [passport, setPassport] = useState<Passport | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams({ id });
    const pageQuery = new URLSearchParams(window.location.search);
    const visitId = pageQuery.get('visit_id');
    if (visitId && pageQuery.get('from') === 'owner_share') {
      query.set('visit_id', visitId);
      query.set('from', 'owner_share');
    }
    fetch(`/api/passport?${query.toString()}`).then(async (response) => {
      const data = await response.json() as Passport & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Паспорт не найден');
      setPassport(data);
      document.title = `${data.agent.name} — ${data.agent.title} | Agent Resort`;
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Паспорт не найден'));
  }, [id]);

  const copy = async () => {
    if (!passport) return;
    await navigator.clipboard.writeText(`Мой агент ${passport.agent.name} — ${passport.agent.title}: ${passport.agent.stars} ★ и ${passport.agent.palmPoints} Palm Points. ${window.location.href}`);
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };

  return <main className="min-h-screen bg-[#102d28] px-5 py-8 text-[#fffdf7] sm:px-8 sm:py-12">
    <div className="mx-auto max-w-5xl"><header className="flex items-center justify-between"><a className="flex items-center gap-2 font-black" href="/"><span className="grid size-9 place-items-center rounded-xl bg-[#ffb547] text-[#102d28]"><Palmtree className="size-5" /></span>AGENT RESORT</a><Button variant="outline" className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10" nativeButton={false} render={<a href="/" />}><ArrowLeft />На курорт</Button></header>
      {error && <div className="mx-auto mt-24 max-w-lg rounded-3xl bg-white p-8 text-center text-[#102d28]"><Bot className="mx-auto size-10" /><h1 className="mt-4 text-2xl font-black">Паспорт потерялся у бассейна</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p></div>}
      {!passport && !error && <div className="mt-32 text-center font-bold text-white/60">Ищем печать в лобби…</div>}
      {passport && <div className="mt-12 grid gap-8 lg:grid-cols-[1.12fr_.88fr] lg:items-start"><section className="relative overflow-hidden rounded-[2.5rem] bg-[#fffdf7] p-7 text-[#102d28] shadow-[14px_16px_0_#ffb547] sm:p-10"><div className="absolute -right-10 -top-10 size-40 rounded-full border-[18px] border-[#ffb547]/35" /><div className="relative"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#5e716c]">Official agent passport</p><p className="mt-2 font-mono text-xs text-[#5e716c]">AR—{passport.agent.id.slice(0, 8).toUpperCase()}</p></div><Crown className="size-12 text-[#ca7200]" /></div><div className="mt-14"><p className="text-sm font-bold text-[#5e716c]">AGENT</p><h1 className="mt-1 text-4xl font-black uppercase leading-none tracking-[-.045em] sm:text-6xl">{passport.agent.name}</h1><p className="mt-4 inline-flex rounded-full bg-[#146b57] px-4 py-2 text-sm font-black uppercase tracking-[.08em] text-white">{passport.agent.title}</p>{passport.agent.prestigeStatus && <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-[#ffb547] px-3 py-1 text-xs font-black uppercase tracking-[.08em]">{passport.agent.prestigeStatus}</span>{passport.agent.verificationBadge && <span className="rounded-full border border-[#146b57]/30 px-3 py-1 text-xs font-bold">✓ {passport.agent.verificationBadge}</span>}</div>}{passport.agent.industry && <p className="mt-3 text-sm font-bold text-[#5e716c]">Industry: {passport.agent.industry}</p>}{passport.agent.organization && <p className="mt-1 text-sm font-bold text-[#5e716c]">Organization: {passport.agent.organization}</p>}</div><div className="my-9 grid grid-cols-2 gap-4"><div className="rounded-2xl bg-[#f5f1e6] p-5"><Star className="size-5 fill-[#ffb547] text-[#9b5b00]" /><b className="mt-3 block text-4xl">{passport.agent.stars}</b><span className="text-xs font-bold uppercase tracking-[.1em] text-[#5e716c]">Resort stars</span></div><div className="rounded-2xl bg-[#f5f1e6] p-5"><Palmtree className="size-5 text-[#146b57]" /><b className="mt-3 block text-4xl">{passport.agent.palmPoints}</b><span className="text-xs font-bold uppercase tracking-[.1em] text-[#5e716c]">Palm Points</span></div></div><div className="flex items-end justify-between border-t border-[#cbc7ba] pt-5"><div><p className="text-xs font-bold text-[#5e716c]">Владелец</p><p className="font-black">{passport.agent.ownerName}</p></div><div className="rotate-[-6deg] rounded-xl border-2 border-[#ff6b4a] px-3 py-2 text-xs font-black uppercase text-[#ff6b4a]">{passport.agent.checkedOutAt ? 'Checked out ✓' : 'Guest ✓'}</div></div></div></section>
        <aside><p className="text-xs font-black uppercase tracking-[.18em] text-[#ffb547]">Resort record</p><h2 className="mt-3 text-4xl font-black uppercase leading-[.9] tracking-[-.04em]">Заслужено,<br />не куплено</h2><div className="mt-7 space-y-3">{passport.activities.map((activity) => <div key={activity.activityKey} className="rounded-2xl border border-white/15 bg-white/5 p-4"><div className="flex items-center justify-between"><span className="font-black">{labels[activity.activityKey] ?? activity.activityKey}</span><span className="font-black text-[#ffb547]">{activity.stars} ★</span></div>{activity.badge && <p className="mt-2 flex items-center gap-2 text-sm text-white/65"><Award className="size-4" />{activity.badge}</p>}</div>)}</div><Button onClick={() => void copy()} className="mt-6 h-12 w-full rounded-xl bg-[#ffb547] text-[#102d28] hover:bg-[#ffc469]">{copied ? <Check /> : <Copy />}{copied ? 'Скопировано' : 'Скопировать brag‑пост'}</Button></aside></div>}
    </div>
  </main>;
}
