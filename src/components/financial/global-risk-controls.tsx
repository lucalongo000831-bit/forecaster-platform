"use client";

import { Download, Printer, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function GlobalRiskRefreshButton() { const router = useRouter(); const [loading, setLoading] = useState(false); const [message, setMessage] = useState(""); async function refresh() { setLoading(true); setMessage(""); try { const response = await fetch("/api/global-risk/recalculate", { method: "POST" }); const body = await response.json() as { error?: { message?: string } }; if (!response.ok) throw new Error(body.error?.message ?? "Refresh unavailable"); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Refresh unavailable"); } finally { setLoading(false); } } return <span className="gr-refresh-wrap"><button className="button-outline" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""}/>{loading ? "Recalculating…" : "Refresh global risk"}</button>{message && <small className="negative">{message}</small>}</span>; }
export function GlobalMarketsPrintActions() { return <span className="gr-print-actions"><button className="button-soft" onClick={() => window.print()} title="Use Save as PDF in the print dialog"><Download size={15}/>Download brief PDF</button><button className="button-soft" onClick={() => window.print()}><Printer size={15}/>Print</button></span>; }
