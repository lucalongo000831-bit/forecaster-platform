"use client";

import { ArrowRight } from "lucide-react";
import { useKairoChat } from "./kairo-chat-provider";

const DAILY_NARRATIVE_PROMPT = "Genera il Daily Market Narrative di oggi con regime, indici principali, mover, earnings, eventi macro, news, rischi geopolitici e rilevanza per la mia watchlist. Usa solo dati verificati dai tool KAIRO e segnala ciò che non è disponibile.";

export function KairoLensButton() {
  const { openKairo } = useKairoChat();
  return <button className="button-outline" onClick={() => openKairo(DAILY_NARRATIVE_PROMPT)}>Generate briefing <ArrowRight size={16}/></button>;
}
