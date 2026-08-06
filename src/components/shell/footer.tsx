import Link from "next/link";
import { financialDataService } from "@/services";

export async function Footer() {
  const brand = await financialDataService.getBrand();
  return <footer className="footer"><div className="container-shell footer-inner"><div className="footer-brand"><span className="brand-mark"><span/></span><div><strong>{brand.name}</strong><small>Independent market intelligence</small></div></div><p>Static product concept · No live financial data</p><nav><Link href="/settings">Privacy</Link><Link href="/settings">Terms</Link><Link href="/login">Sign out</Link></nav></div></footer>;
}
