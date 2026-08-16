"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Clock3, ExternalLink, History, LoaderCircle, MessageCircle, Plus, Send, Square, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { KairoAssetType, KairoSource, KairoStreamEvent } from "@/ai/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: KairoSource[];
}
interface ConversationSummary { id: string; title: string; symbol: string | null; updatedAt: string }
interface KairoContextValue { openKairo: (seed?: string) => void }
const KairoContext = createContext<KairoContextValue | null>(null);

export function useKairoChat() {
  const value = useContext(KairoContext);
  if (!value) throw new Error("useKairoChat deve essere usato dentro KairoChatProvider");
  return value;
}

function pageContext(pathname: string): { symbol?: string; market?: string; assetType?: KairoAssetType; currentPage?: string } {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "instrument" || !parts[1] || !parts[2]) return { currentPage: parts.at(-1) ?? "dashboard" };
  const marketSlug = decodeURIComponent(parts[1]);
  const symbol = decodeURIComponent(parts[2]).toUpperCase();
  const assetType: KairoAssetType = marketSlug.toLowerCase() === "crypto" || /-(USD|EUR|GBP|BTC|ETH)$/.test(symbol) ? "crypto" : symbol.startsWith("^") ? "index" : "equity";
  return { market: marketSlug.toUpperCase(), symbol, assetType, currentPage: parts.slice(3).join("/") || "overview" };
}

function decodeLine(line: string): KairoStreamEvent | null {
  try { return JSON.parse(line) as KairoStreamEvent; } catch { return null; }
}

export function KairoChatProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const pathname = usePathname();
  const context = useMemo(() => pageContext(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const [generating, setGenerating] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const abortRef = useRef<AbortController | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshHistory = useCallback(async () => {
    if (!enabled) return;
    const response = await fetch("/api/ai/conversations", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { data: ConversationSummary[] };
    setConversations(payload.data);
  }, [enabled]);

  const openKairo = useCallback((seed = "") => {
    setOpen(true);
    if (seed) setDraft(seed);
    void refreshHistory();
  }, [refreshHistory]);
  const contextValue = useMemo(() => ({ openKairo }), [openKairo]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, status]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const newConversation = () => {
    abortRef.current?.abort();
    setConversationId(undefined); setMessages([]); setDraft(""); setError(undefined); setStatus(undefined); setShowHistory(false);
  };

  const loadConversation = async (id: string) => {
    const response = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { data: { messages: Array<{ id: string; role: string; content: string; sources: KairoSource[] }> } };
    setConversationId(id);
    setMessages(payload.data.messages.flatMap((message) => message.role === "user" || message.role === "assistant" ? [{ id: message.id, role: message.role, content: message.content, sources: message.sources } as ChatMessage] : []));
    setShowHistory(false); setError(undefined);
  };

  const sendMessage = async (messageInput?: string) => {
    if (!enabled) { setOpen(true); setError("Kairo AI sarà disponibile prossimamente"); return; }
    const message = (messageInput ?? draft).trim();
    if (!message || generating) return;
    setDraft(""); setLastMessage(message); setError(undefined); setGenerating(true); setStatus("Analyzing market data...");
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: message };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    const abortController = new AbortController(); abortRef.current = abortController;
    let activeConversation = conversationId;
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: abortController.signal,
        body: JSON.stringify({ conversationId, message, ...context }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "Ask Kairo non è disponibile");
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          const event = decodeLine(line); if (!event) continue;
          if (event.type === "conversation") { activeConversation = event.conversationId; setConversationId(event.conversationId); }
          if (event.type === "status") setStatus(event.message);
          if (event.type === "tool") setStatus(event.status === "running" ? `${event.name.replaceAll("_", " ")}...` : undefined);
          if (event.type === "delta") setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: item.content + event.text } : item));
          if (event.type === "sources") setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, sources: event.sources } : item));
          if (event.type === "error") throw new Error(event.message);
        }
      }
      if (activeConversation) setConversationId(activeConversation);
      await refreshHistory();
    } catch (caught) {
      if (abortController.signal.aborted) setError("Generazione interrotta.");
      else setError(caught instanceof Error ? caught.message : "Errore temporaneo");
      setMessages((current) => current.filter((item) => item.id !== assistantId || item.content.length > 0));
    } finally {
      setGenerating(false); setStatus(undefined); abortRef.current = undefined;
    }
  };

  return <KairoContext.Provider value={contextValue}>
    {children}
    {open && <>
      <button className="kairo-backdrop" aria-label="Close Ask Kairo" onClick={() => setOpen(false)}/>
      <aside className="kairo-drawer" aria-label="Ask Kairo market intelligence" aria-modal="true" role="dialog">
        <header className="kairo-header">
          <span className="kairo-avatar"><Bot size={20}/></span>
          <span><strong>Ask Kairo</strong><small>{context.symbol ? `${context.symbol} · ${context.currentPage}` : "Market intelligence"}</small></span>
          <button onClick={() => setShowHistory(!showHistory)} aria-label="Conversation history"><History size={18}/></button>
          <button onClick={newConversation} aria-label="New conversation"><Plus size={19}/></button>
          <button onClick={() => setOpen(false)} aria-label="Close"><X size={19}/></button>
        </header>

        {!enabled ? <div className="kairo-messages"><div className="kairo-empty"><span><Bot size={24}/></span><h3>Kairo AI sarà disponibile prossimamente</h3><p>Il modulo è temporaneamente disabilitato. Tutte le funzioni finanziarie restano operative senza richieste OpenAI.</p></div></div> : showHistory ? <div className="kairo-history">
          <div className="kairo-section-label">Recent conversations</div>
          {conversations.map((item) => <button key={item.id} onClick={() => void loadConversation(item.id)}><Clock3 size={15}/><span><strong>{item.title}</strong><small>{item.symbol ?? "Market"}</small></span></button>)}
          {!conversations.length && <p>No conversations yet.</p>}
        </div> : <div className="kairo-messages" ref={scrollRef}>
          {!messages.length && <div className="kairo-empty">
            <span><MessageCircle size={24}/></span><h3>What should we analyze?</h3><p>Kairo combines verified market data, quantitative models and explicit sources.</p>
            <div>{[context.symbol ? `Analizza ${context.symbol}` : "Daily Market Narrative", context.assetType === "crypto" ? "Qual è il rischio principale?" : "Qual è il fair value?", "Mostrami rischi e catalyst"].map((item) => <button key={item} onClick={() => void sendMessage(item)}>{item}</button>)}</div>
          </div>}
          {messages.map((message) => <article className={`kairo-message ${message.role}`} key={message.id}>
            <div>{message.content || (generating && message.role === "assistant" ? <LoaderCircle className="spin" size={18}/> : null)}</div>
            {message.sources && message.sources.length > 0 && <details className="kairo-sources"><summary>Sources · {message.sources.length}</summary>{message.sources.map((item, index) => item.url ? <a href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${index}`}>{item.label}<ExternalLink size={12}/></a> : <span key={`${item.provider}-${index}`}>{item.label} · {item.kind}</span>)}</details>}
          </article>)}
          {status && <div className="kairo-tool-status"><LoaderCircle className="spin" size={15}/>{status}</div>}
          {error && <div className="kairo-error"><span>{error}</span>{lastMessage && !generating && <button onClick={() => void sendMessage(lastMessage)}>Retry</button>}{error.toLowerCase().includes("autenticazione") && <Link href="/login">Sign in</Link>}</div>}
        </div>}

        <form className="kairo-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
          <textarea disabled={!enabled} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={enabled ? (context.symbol ? `Ask about ${context.symbol}…` : "Ask Kairo about a market…") : "Kairo AI sarà disponibile prossimamente"} maxLength={4000}/>
          {generating ? <button type="button" aria-label="Stop generation" onClick={() => abortRef.current?.abort()}><Square size={17}/></button> : <button type="submit" aria-label="Send message" disabled={!draft.trim()}><Send size={18}/></button>}
          <small>{enabled ? "Data-backed analysis · not financial advice" : "AI disabled · financial workspace available"}</small>
        </form>
      </aside>
    </>}
  </KairoContext.Provider>;
}
