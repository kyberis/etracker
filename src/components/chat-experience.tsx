"use client";

import { Chat, useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import Image from "next/image";

import { useBalance } from "@/components/balance-provider";
import { ChatChart } from "@/components/chat-chart";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { chartSpecSchema } from "@/lib/ai/chart-spec";
import { formatBankCsvForAgent } from "@/lib/chat/bank-csv-for-agent";
import { intlLocale } from "@/lib/i18n/format";
import { pick, useLocale, useT, useTx } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type ChatExperienceProps = {
  /** When set (yyyy-MM), the agent prefers this month for ambiguous queries. */
  activeMonth?: string;
  /** `fullscreen`: fills parent (chat home, drawer). Default: card with fixed height. */
  layout?: "default" | "fullscreen";
};

/** Tools whose results should trigger a balance refresh in the sticky header. */
const BALANCE_MUTATING_TOOLS = new Set([
  "addMonthLine",
  "updateMonthLine",
  "createMonthIfNeeded",
  "mergePendingTemplates",
  "setMonthIncome",
  "applyPrevMonthLeftover",
]);

type Suggestion = {
  label: string;
  prompt: string;
  emoji: string;
  tone: "lime" | "pink" | "peach" | "violet";
};

function assistantPlainText(message: UIMessage): string {
  let s = "";
  for (const p of message.parts) {
    if (p.type === "text") s += p.text;
  }
  return s;
}

function pdfBaseName(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

async function dataUrlToPngFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: "image/png" });
}

export function ChatExperience({
  activeMonth,
  layout = "default",
}: ChatExperienceProps = {}) {
  const balance = useBalance();
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const suggestions = useMemo(
    () =>
      [
        {
          label: pick(locale, { es: "¿Cómo voy este mes?", en: "How am I doing this month?" }),
          prompt: pick(locale, {
            es: "¿Cuánto me queda este mes?",
            en: "How much do I have left this month?",
          }),
          emoji: "📊",
          tone: "lime" as const,
        },
        {
          label: pick(locale, { es: "Roastéame", en: "Roast me" }),
          prompt: pick(locale, {
            es: "Roastéame mis gastos de este mes sin piedad.",
            en: "Roast my spending this month with no mercy.",
          }),
          emoji: "🔥",
          tone: "pink" as const,
        },
        {
          label: pick(locale, { es: "Anotá un gasto", en: "Log an expense" }),
          prompt: pick(locale, {
            es: "Anotá un gasto de USD 12 en café, lo pagué con Visa.",
            en: "Log a USD 12 coffee expense; I paid with Visa.",
          }),
          emoji: "🧾",
          tone: "peach" as const,
        },
        {
          label: pick(locale, {
            es: "Distribución por categoría",
            en: "Spending by category",
          }),
          prompt: pick(locale, {
            es: "Mostrame la distribución de gastos del mes por categoría.",
            en: "Show me this month’s spending breakdown by category.",
          }),
          emoji: "🍰",
          tone: "violet" as const,
        },
      ] satisfies Suggestion[],
    [locale],
  );
  const [conversationMode, setConversationMode] = useState(false);
  const [voiceResponses, setVoiceResponses] = useState(false);
  const [voiceUrlByMessageId, setVoiceUrlByMessageId] = useState<Record<string, string>>(
    {},
  );
  const [ttsLoadingMessageId, setTtsLoadingMessageId] = useState<string | null>(null);
  const ttsRequestedRef = useRef(new Set<string>());

  const requestOptsRef = useRef({
    conversationMode: false,
    activeMonth: undefined as string | undefined,
  });

  useEffect(() => {
    requestOptsRef.current.conversationMode = conversationMode;
    requestOptsRef.current.activeMonth = activeMonth;
  }, [conversationMode, activeMonth]);

  /* eslint-disable react-hooks/refs -- prepareSendMessagesRequest runs when the transport POSTs */
  const chat = useMemo(
    () =>
      new Chat({
        transport: new DefaultChatTransport({
          api: "/api/chat",
          prepareSendMessagesRequest: ({ messages, body }) => ({
            body: {
              ...(body ?? {}),
              messages,
              responseStyle:
                requestOptsRef.current.conversationMode ? "conversational" : "concise",
              ...(requestOptsRef.current.activeMonth
                ? { activeMonth: requestOptsRef.current.activeMonth }
                : {}),
            },
          }),
        }),
      }),
    [],
  );
  /* eslint-enable react-hooks/refs */
  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
  } = useChat({ chat });

  const isStreaming = status === "submitted" || status === "streaming";

  // Daily agent quota — per-user counter shared with WhatsApp. Loaded on
  // mount and refreshed every time the assistant finishes a turn so the
  // badge stays accurate without a roundtrip per response.
  const [quota, setQuota] = useState<
    { used: number; limit: number; remaining: number; resetAtUtc: string } | null
  >(null);

  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/usage", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        used: number;
        limit: number;
        remaining: number;
        resetAtUtc: string;
      };
      setQuota(data);
    } catch {
      // Best-effort: a missing badge is preferable to a noisy error.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch updates after await
    void refreshQuota();
  }, [refreshQuota]);

  const wasStreamingForQuotaRef = useRef(false);
  useEffect(() => {
    if (wasStreamingForQuotaRef.current && !isStreaming) {
      void refreshQuota();
    }
    wasStreamingForQuotaRef.current = isStreaming;
  }, [isStreaming, refreshQuota]);

  // When a turn finishes, return focus to the textarea — but only if focus
  // was effectively lost (e.g. the Send-button click handed focus to a
  // button that got unmounted). If the user already moved on to another
  // element we leave them alone, and on mobile we skip entirely so we don't
  // pop the soft keyboard back open after Clara replies.
  const wasStreamingForFocusRef = useRef(false);
  useEffect(() => {
    if (wasStreamingForFocusRef.current && !isStreaming) {
      const isCoarsePointer =
        typeof window !== "undefined" &&
        window.matchMedia?.("(pointer: coarse)").matches;
      if (!isCoarsePointer) {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        const focusLost =
          !active || active === document.body || active === textareaRef.current;
        if (focusLost) textareaRef.current?.focus();
      }
    }
    wasStreamingForFocusRef.current = isStreaming;
  }, [isStreaming]);

  // After each assistant turn, peek the last assistant message for tool parts
  // that mutate state and refresh the balance pill if any.
  const lastRefreshedAssistantRef = useRef<string | null>(null);
  useEffect(() => {
    if (isStreaming) return;
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant || lastAssistant.id === lastRefreshedAssistantRef.current) return;

    const usedMutatingTool = lastAssistant.parts.some((part) => {
      if (part.type === "dynamic-tool") {
        return (
          "toolName" in part &&
          typeof part.toolName === "string" &&
          BALANCE_MUTATING_TOOLS.has(part.toolName)
        );
      }
      if (typeof part.type === "string" && part.type.startsWith("tool-")) {
        const tool = part.type.replace(/^tool-/, "");
        return BALANCE_MUTATING_TOOLS.has(tool);
      }
      return false;
    });

    lastRefreshedAssistantRef.current = lastAssistant.id;
    if (usedMutatingTool) {
      void balance.refresh();
    }
  }, [messages, isStreaming, balance]);

  // When the agent calls `setUserLocale`, we need to refresh the surrounding
  // UI (header, html lang, server-rendered dictionary) so it picks up the new
  // locale from the DB. We also re-fetch balance because currency formatting
  // is locale-aware.
  const lastLocaleRefreshRef = useRef<string | null>(null);
  useEffect(() => {
    if (isStreaming) return;
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant || lastAssistant.id === lastLocaleRefreshRef.current) return;

    const switchedLocale = lastAssistant.parts.some((part) => {
      if (part.type === "dynamic-tool") {
        return (
          "toolName" in part &&
          typeof part.toolName === "string" &&
          part.toolName === "setUserLocale"
        );
      }
      if (typeof part.type === "string" && part.type.startsWith("tool-")) {
        return part.type.replace(/^tool-/, "") === "setUserLocale";
      }
      return false;
    });

    lastLocaleRefreshRef.current = lastAssistant.id;
    if (switchedLocale) {
      router.refresh();
    }
  }, [messages, isStreaming, router]);

  useEffect(() => {
    if (!voiceResponses || isStreaming) return;

    const assistants = messages.filter((m) => m.role === "assistant");
    const lastAssistant = assistants[assistants.length - 1];
    if (!lastAssistant) return;

    const plain = assistantPlainText(lastAssistant);
    if (!plain.trim() || plain.length > 4096) return;
    if (ttsRequestedRef.current.has(lastAssistant.id)) return;

    ttsRequestedRef.current.add(lastAssistant.id);
    setTtsLoadingMessageId(lastAssistant.id);

    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/audio/speech", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: plain }),
          signal: ac.signal,
        });
        if (!res.ok) {
          ttsRequestedRef.current.delete(lastAssistant.id);
          return;
        }
        const data = (await res.json()) as { audioUrl?: string };
        if (!data.audioUrl) {
          ttsRequestedRef.current.delete(lastAssistant.id);
          return;
        }
        setVoiceUrlByMessageId((prev) => ({ ...prev, [lastAssistant.id]: data.audioUrl! }));
      } catch {
        ttsRequestedRef.current.delete(lastAssistant.id);
      } finally {
        setTtsLoadingMessageId((cur) => (cur === lastAssistant.id ? null : cur));
      }
    })();

    return () => {
      ac.abort();
    };
  }, [messages, isStreaming, voiceResponses]);

  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Persistent history: hydrated from `/api/chat/history` on mount and
  // extended via the "Cargar mensajes anteriores" button. `hydratedAtRef`
  // gates the first auto-scroll so the user lands at the bottom on initial
  // load (last message visible) but doesn't get yanked when prepending older
  // history.
  const [historyLoading, setHistoryLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [oldestId, setOldestId] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const skipNextAutoScrollRef = useRef(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/chat/history?limit=50", {
          credentials: "same-origin",
          signal: ac.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: UIMessage[];
          hasMore: boolean;
          oldestId: string | null;
        };
        if (data.messages.length > 0) {
          setMessages(data.messages);
        }
        setHasMore(Boolean(data.hasMore));
        setOldestId(data.oldestId);
      } catch {
        // Silent: an empty chat is preferable to a crash on a flaky network.
      } finally {
        setHistoryLoading(false);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [setMessages]);

  const loadMoreHistory = useCallback(async () => {
    if (loadingOlder || !hasMore || !oldestId) return;
    setLoadingOlder(true);
    const el = scrollerRef.current;
    // Anchor the visual position so prepending older messages doesn't yank
    // the scroller back to the top.
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;
    try {
      const res = await fetch(
        `/api/chat/history?limit=50&before=${encodeURIComponent(oldestId)}`,
        { credentials: "same-origin" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: UIMessage[];
        hasMore: boolean;
        oldestId: string | null;
      };
      if (data.messages.length > 0) {
        skipNextAutoScrollRef.current = true;
        setMessages((prev) => [...data.messages, ...prev]);
        // Restore the scroll position after the prepend lays out.
        requestAnimationFrame(() => {
          const next = scrollerRef.current;
          if (!next) return;
          next.scrollTop = prevScrollTop + (next.scrollHeight - prevScrollHeight);
        });
      }
      setHasMore(Boolean(data.hasMore));
      setOldestId(data.oldestId ?? oldestId);
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, oldestId, loadingOlder, setMessages]);

  // Auto-scroll to bottom on new outgoing/incoming messages and during
  // streaming. Skipped exactly once when older history is prepended.
  useEffect(() => {
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  function clearFiles() {
    setFiles(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submitText(messageText: string) {
    // Refocus immediately so the textarea stays "live" — the user can keep
    // typing the next message while Clara is still streaming, WhatsApp-style.
    textareaRef.current?.focus();
    await sendMessage({ text: messageText });
    textareaRef.current?.focus();
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    const fileArray = files ? Array.from(files) : [];
    const imageFiles = fileArray.filter((f) => f.type.startsWith("image/"));
    const csvFiles = fileArray.filter(
      (f) =>
        f.type === "text/csv" ||
        f.type === "application/csv" ||
        f.name.toLowerCase().endsWith(".csv"),
    );
    const pdfFiles = fileArray.filter(
      (f) =>
        f.type === "application/pdf" ||
        f.type === "application/x-pdf" ||
        f.name.toLowerCase().endsWith(".pdf"),
    );

    if (!text && imageFiles.length === 0 && csvFiles.length === 0 && pdfFiles.length === 0)
      return;

    // Clear the composer and refocus the textarea synchronously, BEFORE any
    // `await`. This way the input goes blank the instant the user hits Enter
    // and the cursor stays in the textarea so they can keep typing while we
    // process attachments and stream the response. Refocusing after the
    // awaited work is too late: the Send → Stop button swap can steal focus
    // and the user perceives it as the textarea "losing" the cursor.
    setInput("");
    clearFiles();
    textareaRef.current?.focus();

    const csvBlocks: string[] = [];
    for (const csvFile of csvFiles) {
      try {
        const raw = await csvFile.text();
        csvBlocks.push(formatBankCsvForAgent(raw, csvFile.name));
      } catch {
        csvBlocks.push(
          pick(locale, {
            es: `(_No se pudo leer el CSV ${csvFile.name}._)`,
            en: `(_Could not read CSV ${csvFile.name}._)`,
          }),
        );
      }
    }

    const pdfBlocks: string[] = [];
    const pdfImageFiles: File[] = [];
    for (const pdfFile of pdfFiles) {
      try {
        const fd = new FormData();
        fd.append("file", pdfFile);
        const res = await fetch("/api/chat/extract-pdf", {
          method: "POST",
          body: fd,
          credentials: "same-origin",
        });
        const payload = (await res.json()) as {
          text?: string;
          images?: { dataUrl: string; pageNumber: number }[];
          error?: string;
        };
        if (!res.ok) {
          pdfBlocks.push(
            `(_PDF ${pdfFile.name}: ${
              payload.error ??
              pick(locale, { es: "no se pudo leer el archivo", en: "could not read file" })
            }._)`,
          );
          continue;
        }
        const extracted = payload.text?.trim() ?? "";
        if (extracted) {
          pdfBlocks.push(`### Texto extraído: ${pdfFile.name}\n\n${extracted}`);
        }
        if (payload.images?.length) {
          for (const { dataUrl, pageNumber } of payload.images) {
            const pagePng = await dataUrlToPngFile(
              dataUrl,
              `${pdfBaseName(pdfFile.name)}-p${pageNumber}.png`,
            );
            pdfImageFiles.push(pagePng);
          }
          if (!extracted) {
            pdfBlocks.push(
              pick(locale, {
                es: `(_PDF ${pdfFile.name}: sin texto seleccionable; las primeras ${payload.images.length} página(s) van como imagen adjunta._)`,
                en: `(_PDF ${pdfFile.name}: no selectable text; first ${payload.images.length} page(s) sent as attached images._)`,
              }),
            );
          }
        }
      } catch {
        pdfBlocks.push(
          pick(locale, {
            es: `(_No se pudo leer el PDF ${pdfFile.name}._)`,
            en: `(_Could not read PDF ${pdfFile.name}._)`,
          }),
        );
      }
    }

    let messageText = text;
    if (csvBlocks.length > 0) {
      const csvSection = csvBlocks.join("\n\n---\n\n");
      const intro = pick(locale, {
        es: "Te adjunto movimientos exportados del banco (CSV). Usá la lista que sigue; respetá mis instrucciones personales si las hay. Pedí confirmación antes de cargar o marcar pagos.",
        en: "I'm attaching bank-exported movements (CSV). Use the list below; respect my personal instructions if any. Ask for confirmation before loading or marking payments.",
      });
      messageText = messageText
        ? `${messageText}\n\n${intro}\n\n${csvSection}`
        : `${intro}\n\n${csvSection}`;
    }
    if (pdfBlocks.length > 0) {
      const pdfSection = pdfBlocks.join("\n\n---\n\n");
      const intro = pick(locale, {
        es: "Te adjunto uno o más PDF: texto cuando el archivo tiene capa de texto, y/o páginas renderizadas como imagen si era escaneo u hoja visual. Tratalo como extracto o resumen bancario; respetá mis instrucciones personales. Pedí confirmación antes de cargar o marcar pagos.",
        en: "I'm attaching one or more PDFs: text when the file has a text layer, and/or pages rendered as images if it was a scan or visual sheet. Treat it as a bank statement or summary; respect my personal instructions. Ask for confirmation before loading or marking payments.",
      });
      messageText = messageText
        ? `${messageText}\n\n${intro}\n\n${pdfSection}`
        : `${intro}\n\n${pdfSection}`;
    }

    const allImageAttachments = [...imageFiles, ...pdfImageFiles];

    if (!messageText && allImageAttachments.length > 0) {
      messageText = pick(locale, { es: "Imagen adjunta.", en: "Image attached." });
    }

    const dt = new DataTransfer();
    for (const img of allImageAttachments) {
      dt.items.add(img);
    }
    const imageList = dt.files;

    await sendMessage({
      text: messageText,
      ...(imageList.length > 0 ? { files: imageList } : {}),
    });
    // Safety net in case focus moved during the awaited work above (e.g. the
    // Send button got replaced by the Stop button while we were processing
    // attachments and React's render stole focus). Cheap if it's already
    // focused — the browser no-ops.
    textareaRef.current?.focus();
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(event.target.files);
  }

  const fullscreen = layout === "fullscreen";

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        fullscreen
          ? "min-h-0 flex-1"
          : "surface-card min-h-0 max-h-[78vh] overflow-hidden p-5",
      )}
    >
      {/* messages */}
      <div
        ref={scrollerRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          fullscreen ? "px-3 pt-4 pb-2 sm:px-6" : "space-y-3 pr-1",
        )}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {historyLoading ? (
            <HistoryLoadingSkeleton />
          ) : (
            <>
              {hasMore ? (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => void loadMoreHistory()}
                    disabled={loadingOlder}
                    className="bg-lilac/10 text-lilac border-lilac/20 hover:bg-lilac/15 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-60"
                  >
                    {loadingOlder ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <ChevronUp className="size-3.5" aria-hidden />
                    )}
                    {pick(locale, { es: "cargar mensajes anteriores", en: "load older messages" })}
                  </button>
                </div>
              ) : null}
              {messages.length === 0 ? (
                <EmptyState
                  suggestions={suggestions}
                  onPick={(prompt) => {
                    setInput(prompt);
                    void submitText(prompt);
                  }}
                />
              ) : (
                messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    audioSrc={
                      m.role === "assistant" ? voiceUrlByMessageId[m.id] : undefined
                    }
                    audioLoading={
                      m.role === "assistant" && ttsLoadingMessageId === m.id
                    }
                  />
                ))
              )}
              {isStreaming && messages.length > 0 ? <TypingIndicator /> : null}
              {error ? (
                <p className="text-sm text-bad px-2">
                  {error.message ?? t.chat.error}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {quota ? <QuotaBadge quota={quota} /> : null}

      {/* composer — stays pinned at the bottom of the flex column. With
          `min-h-dvh` on the AppShell + `interactive-widget=resizes-content`
          in the viewport, the layout shrinks when the on-screen keyboard
          opens, so the composer ends up sitting right above the keyboard
          (WhatsApp-style) without needing artificial padding on the
          scroller. */}
      <form
        onSubmit={handleSubmit}
        className={cn(
          fullscreen
            ? "bg-background/95 supports-[backdrop-filter]:bg-background/80 mt-auto border-t border-foreground/5 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur sm:px-6"
            : "mt-3",
        )}
      >
        <div className="mx-auto w-full max-w-3xl">
          {/* suggestions when empty (skipped during history hydration) */}
          {messages.length === 0 && !historyLoading ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {suggestions.slice(0, 2).map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setInput(s.prompt);
                    void submitText(s.prompt);
                  }}
                  disabled={isStreaming}
                  className="bg-card text-foreground rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-foreground/5 transition-all hover:-translate-y-0.5 hover:shadow disabled:opacity-50"
                >
                  <span className="mr-1.5" aria-hidden>
                    {s.emoji}
                  </span>
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="bg-card flex items-end gap-2 rounded-full px-2 py-2 shadow-[0_18px_50px_-28px_oklch(0.18_0.08_285/0.4)] ring-1 ring-foreground/5">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="rounded-full"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t.chat.attachLabel}
              disabled={isStreaming}
            >
              <Paperclip className="size-4" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={pick(locale, {
                es: "Decime algo… o adjuntá un PDF del banco 📎",
                en: "Say something… or attach a bank PDF 📎",
              })}
              rows={1}
              className="min-h-10 max-h-40 flex-1 resize-none border-0 bg-transparent px-1.5 py-2 text-sm shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              // Intentionally NOT `disabled={isStreaming}`: WhatsApp-style,
              // the user keeps focus and can start typing the next message
              // while Clara is still answering. Disabling here on iOS would
              // collapse the soft keyboard mid-stream, which is jarring.
              // Intentionally NOT `autoFocus`: opening the chat shouldn't
              // pop the keyboard. The user taps the field when they want to
              // type — just like WhatsApp.
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.csv,text/csv,application/csv,.pdf,application/pdf"
              multiple
              onChange={handleFiles}
              className="hidden"
            />
            <ChatModeMenu
              conversationMode={conversationMode}
              onConversationChange={setConversationMode}
              voiceResponses={voiceResponses}
              onVoiceChange={(v) => {
                setVoiceResponses(v);
                if (!v) {
                  ttsRequestedRef.current = new Set();
                  setVoiceUrlByMessageId({});
                  setTtsLoadingMessageId(null);
                }
              }}
            />
            {isStreaming ? (
              <Button
                type="button"
                size="icon-lg"
                variant="outline"
                className="rounded-full"
                onClick={() => stop()}
                aria-label={t.chat.composerStop}
              >
                <Square className="size-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-lg"
                className="gradient-lime text-ink size-10 rounded-full shadow-[0_12px_24px_-10px_oklch(0.74_0.18_156/0.55)] hover:opacity-95"
                disabled={!input.trim() && (!files || files.length === 0)}
                aria-label={t.chat.composerSend}
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>

          {files && files.length > 0 ? (
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 px-3 text-xs">
              <span className="bg-card rounded-full px-2.5 py-0.5 ring-1 ring-foreground/5">
                {files.length}{" "}
                {pick(locale, {
                  es: `archivo${files.length === 1 ? "" : "s"} adjuntos`,
                  en: `attached file${files.length === 1 ? "" : "s"}`,
                })}
              </span>
              <button
                type="button"
                onClick={clearFiles}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                {pick(locale, { es: "limpiar", en: "clear" })}
              </button>
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function ChatModeMenu({
  conversationMode,
  onConversationChange,
  voiceResponses,
  onVoiceChange,
}: {
  conversationMode: boolean;
  onConversationChange: (v: boolean) => void;
  voiceResponses: boolean;
  onVoiceChange: (v: boolean) => void;
}) {
  const t = useT();
  const tr = useTx();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden h-10 rounded-full px-3 sm:inline-flex"
            aria-label={tr({ es: "Opciones del asistente", en: "Assistant options" })}
          />
        }
      >
        <span className="sticker sticker-soft">
          {conversationMode
            ? tr({ es: "convo", en: "convo" })
            : tr({ es: "conciso", en: "concise" })}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-72 rounded-2xl p-3"
      >
        <p className="text-muted-foreground text-[10px] uppercase tracking-[0.18em] mb-2">
          {tr({ es: "Asistente", en: "Assistant" })}
        </p>
        <div className="space-y-3 px-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label
                htmlFor="etracker-conversation-mode"
                className="cursor-pointer text-sm font-medium"
              >
                <Sparkles className="mr-1.5 inline size-3.5 text-primary" />
                {tr({ es: "Modo conversación", en: "Conversation mode" })}
              </Label>
              <p className="text-muted-foreground text-xs">
                {tr({
                  es: "Saludos y explicaciones cortas. Conciso por defecto.",
                  en: "Short greetings and explanations. Concise by default.",
                })}
              </p>
            </div>
            <Switch
              id="etracker-conversation-mode"
              checked={conversationMode}
              onCheckedChange={onConversationChange}
            />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label
                htmlFor="etracker-voice-reply"
                className="cursor-pointer text-sm font-medium"
              >
                <Volume2 className="mr-1.5 inline size-3.5 text-primary" />
                {tr({ es: "Respuesta en audio", en: "Voice reply" })}
              </Label>
              <p className="text-muted-foreground text-xs">
                {tr({
                  es: "Genera un MP3 con la respuesta del asistente.",
                  en: "Generate an MP3 of the assistant’s reply.",
                })}
              </p>
            </div>
            <Switch
              id="etracker-voice-reply"
              checked={voiceResponses}
              onCheckedChange={onVoiceChange}
            />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyState({
  suggestions,
  onPick,
}: {
  suggestions: Suggestion[];
  onPick: (prompt: string) => void;
}) {
  const tr = useTx();
  return (
    <div className="flex flex-col items-center gap-7 py-10 text-center">
      <span className="sticker sticker-lime">
        {tr({ es: "hola, soy tu coach", en: "hi, I’m your coach" })}
      </span>
      <Image
        src="/clara-avatar-simple.png"
        alt="Clara"
        width={80}
        height={80}
        className="avatar-clara size-20 rounded-full object-cover"
      />
      <div className="space-y-3">
        <h2 className="display text-3xl tracking-tight sm:text-4xl">
          {tr({
            es: (
              <>
                ¿qué hacemos
                <br />
                con tu plata hoy?
              </>
            ),
            en: (
              <>
                what are
                <br />
                we doing with your money?
              </>
            ),
          })}
        </h2>
        <p className="text-muted-foreground mx-auto max-w-md text-sm">
          {tr({
            es: (
              <>
                Anotá un gasto, marcá un pago, adjuntá una captura del banco. Si querés que sea
                cruel, pedí un <span className="font-bold text-foreground">roast</span>.
              </>
            ),
            en: (
              <>
                Log an expense, mark a payment, attach a bank screenshot. If you want it mean, ask
                for a <span className="font-bold text-foreground">roast</span>.
              </>
            ),
          })}
        </p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.prompt)}
            className="bg-card group flex items-start gap-3 rounded-3xl px-4 py-3.5 text-left ring-1 ring-foreground/5 transition-all hover:-translate-y-0.5 hover:ring-foreground/10 hover:shadow-md"
          >
            <span
              className={cn(
                "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl text-lg",
                s.tone === "lime" && "bg-lime/30",
                s.tone === "pink" && "bg-hotpink/15",
                s.tone === "peach" && "bg-peach/30",
                s.tone === "violet" && "bg-lilac/30",
              )}
              aria-hidden
            >
              {s.emoji}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-bold">{s.label}</span>
              <span className="text-muted-foreground text-xs">{s.prompt}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryLoadingSkeleton() {
  const tr = useTx();
  return (
    <div
      className="flex flex-col gap-3 py-6"
      aria-label={tr({ es: "Cargando conversación…", en: "Loading conversation…" })}
    >
      <div className="bg-card/60 ml-auto h-10 w-44 animate-pulse rounded-full" />
      <div className="bg-card/60 mr-auto h-12 w-64 animate-pulse rounded-3xl" />
      <div className="bg-card/60 ml-auto h-10 w-56 animate-pulse rounded-full" />
      <div className="bg-card/60 mr-auto h-14 w-72 animate-pulse rounded-3xl" />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end justify-start gap-2">
      <Image
        src="/clara-avatar-simple.png"
        alt=""
        width={36}
        height={36}
        className="avatar-clara size-9 shrink-0 rounded-full object-cover"
        aria-hidden
      />
      <div className="bubble-clara flex items-center gap-1.5 px-4 py-3">
        <span className="bg-lime-deep size-1.5 animate-pulse rounded-full" />
        <span
          className="bg-lime-deep size-1.5 animate-pulse rounded-full"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="bg-lime-deep size-1.5 animate-pulse rounded-full"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
    </div>
  );
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="markdown-body space-y-2 break-words text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          h1: ({ children }) => (
            <h1 className="mt-1 text-base font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-1 text-base font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-1 text-sm font-semibold">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-1 text-sm font-semibold">{children}</h4>
          ),
          ul: ({ children }) => (
            <ul className="ml-4 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-4 list-decimal space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-foreground/30 border-l-2 pl-3 italic opacity-90">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-foreground/20 my-2" />,
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code
                  className={`block overflow-x-auto rounded-md bg-foreground/10 p-2 font-mono text-xs ${className ?? ""}`}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-md bg-foreground/10 p-2 text-xs">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-foreground/30 border-b">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-foreground/15 border-t px-2 py-1 align-top">
              {children}
            </td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function MessageBubble({
  message,
  audioSrc,
  audioLoading,
}: {
  message: UIMessage;
  audioSrc?: string;
  audioLoading?: boolean;
}) {
  const tr = useTx();
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser ? (
        <Image
          src="/clara-avatar-simple.png"
          alt=""
          width={36}
          height={36}
          className="avatar-clara size-9 shrink-0 rounded-full object-cover"
          aria-hidden
        />
      ) : null}
      <div
        className={cn(
          "max-w-[82%] px-4 py-3 text-sm",
          isUser ? "bubble-user" : "bubble-clara",
        )}
      >
        <div className="space-y-2">
          {message.parts.map((part, i) => {
            if (part.type === "text") {
              return isUser ? (
                <div key={i} className="max-h-[min(70vh,28rem)] overflow-y-auto">
                  <p className="whitespace-pre-wrap">{part.text}</p>
                </div>
              ) : (
                <MarkdownContent key={i} text={part.text} />
              );
            }
            if (part.type === "file" && part.mediaType?.startsWith("image/")) {
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={part.url}
                  alt={part.filename ?? tr({ es: "Adjunto", en: "Attachment" })}
                  className="max-h-64 rounded-2xl"
                />
              );
            }
            if (part.type === "tool-renderChart") {
              if (part.state === "output-available") {
                const out = part.output as { ok?: boolean; spec?: unknown };
                const parsed = chartSpecSchema.safeParse(out?.spec);
                if (parsed.success) {
                  return <ChatChart key={i} spec={parsed.data} />;
                }
              }
              return (
                <p
                  key={i}
                  className="text-xs italic opacity-70"
                  aria-label="render chart"
                >
                  {tr({ es: "Preparando gráfico…", en: "Preparing chart…" })}
                </p>
              );
            }
            if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
              const toolName =
                "toolName" in part && typeof part.toolName === "string"
                  ? part.toolName
                  : part.type.replace(/^tool-/, "");
              return (
                <p
                  key={i}
                  className="text-xs italic opacity-70"
                  aria-label={`tool ${toolName}`}
                >
                  {tr({ es: `Usando herramienta: ${toolName}…`, en: `Using tool: ${toolName}…` })}
                </p>
              );
            }
            return null;
          })}
          {!isUser && audioLoading ? (
            <p className="text-muted-foreground text-xs italic">
              {tr({ es: "Generando audio…", en: "Generating audio…" })}
            </p>
          ) : null}
          {!isUser && audioSrc ? (
            <audio
              controls
              className="mt-1 h-9 w-full max-w-[min(100%,20rem)]"
              src={audioSrc}
              preload="metadata"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QuotaBadge({
  quota,
}: {
  quota: { used: number; limit: number; remaining: number; resetAtUtc: string };
}) {
  const locale = useLocale();
  const tr = useTx();
  const low = quota.remaining > 0 && quota.remaining <= 3;
  const empty = quota.remaining === 0;
  const resetLocal = new Date(quota.resetAtUtc).toLocaleString(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="pointer-events-none mx-auto w-full max-w-3xl px-3 sm:px-6">
      <div
        className={cn(
          "pointer-events-auto mx-auto -mb-1 flex w-fit items-center gap-1.5 rounded-full bg-card/80 px-3 py-1 text-[11px] ring-1 ring-foreground/5 backdrop-blur",
          empty
            ? "text-bad"
            : low
              ? "text-peach"
              : "text-muted-foreground",
        )}
        title={tr({
          es: `Se reinicia ~${resetLocal} (00:00 UTC).`,
          en: `Resets ~${resetLocal} (00:00 UTC).`,
        })}
      >
        <span className="font-semibold">{tr({ es: "Asistente", en: "Assistant" })}</span>
        <span className="font-mono">
          {quota.used}/{quota.limit}
        </span>
        <span className="text-muted-foreground/80">{tr({ es: "hoy", en: "today" })}</span>
      </div>
    </div>
  );
}
