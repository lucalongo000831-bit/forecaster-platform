import Link from "next/link";
import { financialDataService } from "@/services";

export async function Footer() {
  const brand = await financialDataService.getBrand();
  return <footer className="footer"><div className="container-shell footer-inner"><div className="footer-brand"><span className="brand-mark"><span/></span><div><strong>{brand.name}</strong><small>Independent market intelligence</small></div></div><p>Server-side market data · Explicit provenance · Not financial advice</p><nav><Link href="/legal/methodology">Methodology</Link><Link href="/legal/providers">Providers</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/disclaimer">Disclaimer</Link></nav></div></footer>;
}
