import Link from "next/link";

export function LegalPage({ kicker, title, updated = "06 August 2026", children }: { kicker: string; title: string; updated?: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#f4f6fa] py-10"><div className="container-shell"><nav className="section-row"><Link href="/" className="brand !flex-none"><span className="brand-mark"><span/></span><span className="brand-name"><strong className="!text-[#172033]">KAIRO</strong><small>Independent market intelligence</small></span></Link><Link className="button-outline" href="/dashboard">Open workspace</Link></nav><article className="card mx-auto mt-10 max-w-4xl p-7 md:p-12"><span className="page-kicker">{kicker}</span><h1 className="page-title mt-3">{title}</h1><p className="muted mt-3">Last updated: {updated}</p><div className="legal-copy mt-10 grid gap-7">{children}</div></article></div></main>;
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h2 className="text-xl font-bold">{title}</h2><div className="muted mt-3 grid gap-3 leading-7">{children}</div></section>; }
