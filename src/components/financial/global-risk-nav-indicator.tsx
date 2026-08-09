"use client";

import { useEffect, useState } from "react";
import type { GlobalRiskStatus } from "@/engines/global-risk";
export function GlobalRiskNavIndicator() { const [status, setStatus] = useState<GlobalRiskStatus | null>(null); useEffect(() => { const controller = new AbortController(); void fetch("/api/global-risk/current", { signal: controller.signal }).then((response) => response.json()).then((body: { data?: { status?: GlobalRiskStatus } }) => setStatus(body.data?.status ?? null)).catch(() => undefined); return () => controller.abort(); }, []); return <i className={`gr-nav-dot ${status?.toLowerCase() ?? "unknown"}`} title={status ? `Global risk: ${status}` : "Global risk unavailable"}/>; }
