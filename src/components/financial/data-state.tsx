import { AlertCircle, DatabaseZap } from "lucide-react";
import type { DataSource } from "@/types";

export function DataSourceNotice({ source }: { source?: DataSource }) {
  if (!source || source === "yahoo" || source === "calculated") return null;
  return <div className="soft-card flex items-center gap-3 p-4 text-sm"><DatabaseZap className="text-indigo-400" size={18}/><span><strong>{source === "mock" ? "Modalità demo" : "Dato non disponibile"}</strong> · {source === "mock" ? "Yahoo Finance non ha risposto; i valori visibili sono mock e non dati di mercato reali." : "Questa sezione richiede un provider alternativo."}</span></div>;
}

export function DataUnavailable({ title = "Dato non disponibile", detail = "Questa informazione non è fornita direttamente da Yahoo Finance." }: { title?: string; detail?: string }) {
  return <div className="soft-card grid min-h-40 place-items-center p-7 text-center"><div><DatabaseZap className="mx-auto text-indigo-400"/><strong className="mt-3 block text-lg">{title}</strong><p className="muted mt-2">{detail}</p></div></div>;
}

export function DataError({ message }: { message: string }) {
  return <div className="soft-card flex items-center gap-3 p-5 text-sm text-red-700"><AlertCircle size={18}/><span>{message}</span></div>;
}
