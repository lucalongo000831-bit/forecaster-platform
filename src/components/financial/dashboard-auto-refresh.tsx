"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function DashboardAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => { if (!document.hidden) router.refresh(); timer = window.setTimeout(refresh, document.hidden ? 120_000 : 30_000); };
    const onVisibility = () => { if (!document.hidden) router.refresh(); };
    timer = window.setTimeout(refresh, 30_000); document.addEventListener("visibilitychange", onVisibility);
    return () => { if (timer) window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [router]);
  return null;
}
