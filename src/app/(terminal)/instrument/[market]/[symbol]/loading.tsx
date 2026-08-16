export default function InstrumentSectionLoading() {
  return <div className="container-shell page-stack" aria-label="Loading instrument section">
    <div className="h-10 w-full max-w-sm animate-pulse rounded-xl bg-slate-200"/>
    <div className="grid-3"><div className="soft-card h-32 animate-pulse"/><div className="soft-card h-32 animate-pulse"/><div className="soft-card h-32 animate-pulse"/></div>
    <div className="soft-card h-80 animate-pulse"/>
  </div>;
}
