"use client";

import { Chat, useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ChatChart } from "@/components/chat-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { chartSpecSchema } from "@/lib/ai/chart-spec";
import { formatBankCsvForAgent } from "@/lib/chat/bank-csv-for-agent";
import { cn } from "@/lib/utils";

export type ChatExperienceProps = {
  /** When set (yyyy-MM), the agent prefers this month for ambiguous queries. */
  activeMonth?: string;
  /** `fullscreen`: fills parent (e.g. fullscreen dialog). Default: fixed 70vh card. */
  layout?: "default" | "fullscreen";
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

export function ChatExperience({ activeMonth, layout = "default" }: ChatExperienceProps = {}) {
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

  // Centralizing the chat instance so transport configuration sits next to the
  // hook and we can wire image attachments through `sendMessage({ files })`.
  // Ref keeps flags current without recreating Chat (which would drop history).
  /* eslint-disable react-hooks/refs -- prepareSendMessagesRequest runs when the transport POSTs, not during render */
  const chat = useMemo(
    () =>
      new Chat({
        transport: new DefaultChatTransport({
          api: "/api/chat",
          prepareSendMessagesRequest: ({ messages, body }) => ({
            body: {
              ...(body ?? {}),
              messages,
              responseStyle: requestOptsRef.current.conversationMode ? "conversational" : "concise",
              ...(requestOptsRef.current.activeMonth ?
                { activeMonth: requestOptsRef.current.activeMonth }
              : {}),
            },
          }),
        }),
      }),
    [],
  );
  /* eslint-enable react-hooks/refs */
  const { messages, sendMessage, status, error, stop } = useChat({ chat });

  const isStreaming = status === "submitted" || status === "streaming";

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
  const wasStreamingRef = useRef(false);

  // Bring focus back to the textarea once the assistant finishes streaming
  // so the user can keep typing without clicking the input again.
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      textareaRef.current?.focus();
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  function clearFiles() {
    setFiles(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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

    const csvBlocks: string[] = [];
    for (const csvFile of csvFiles) {
      try {
        const raw = await csvFile.text();
        csvBlocks.push(formatBankCsvForAgent(raw, csvFile.name));
      } catch {
        csvBlocks.push(`(_No se pudo leer el CSV ${csvFile.name}._)`);
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
            `(_PDF ${pdfFile.name}: ${payload.error ?? "no se pudo leer el archivo"}._)`,
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
              `(_PDF ${pdfFile.name}: sin texto seleccionable; las primeras ${payload.images.length} página(s) van como imagen adjunta._)`,
            );
          }
        }
      } catch {
        pdfBlocks.push(`(_No se pudo leer el PDF ${pdfFile.name}._)`);
      }
    }

    let messageText = text;
    if (csvBlocks.length > 0) {
      const csvSection = csvBlocks.join("\n\n---\n\n");
      const intro =
        "Te adjunto movimientos exportados del banco (CSV). Usá la lista que sigue; respetá mis instrucciones personales si las hay. Pedí confirmación antes de cargar o marcar pagos.";
      messageText = messageText
        ? `${messageText}\n\n${intro}\n\n${csvSection}`
        : `${intro}\n\n${csvSection}`;
    }
    if (pdfBlocks.length > 0) {
      const pdfSection = pdfBlocks.join("\n\n---\n\n");
      const intro =
        "Te adjunto uno o más PDF: texto cuando el archivo tiene capa de texto, y/o páginas renderizadas como imagen si era escaneo u hoja visual. Tratalo como extracto o resumen bancario; respetá mis instrucciones personales. Pedí confirmación antes de cargar o marcar pagos.";
      messageText = messageText
        ? `${messageText}\n\n${intro}\n\n${pdfSection}`
        : `${intro}\n\n${pdfSection}`;
    }

    const allImageAttachments = [...imageFiles, ...pdfImageFiles];

    if (!messageText && allImageAttachments.length > 0) {
      messageText = "Imagen adjunta.";
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
    setInput("");
    clearFiles();
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(event.target.files);
  }

  return (
    <Card
      className={
        layout === "fullscreen" ? "flex h-full min-h-0 flex-1 flex-col border-0 shadow-none" : ""
      }
    >
      <CardContent
        className={
          layout === "fullscreen"
            ? "flex h-full min-h-0 flex-1 flex-col gap-4 px-3 py-3 sm:px-4"
            : "flex h-[70vh] flex-col gap-4"
        }
      >
        <div className="space-y-2 border-border border-b pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Label
                htmlFor="etracker-conversation-mode"
                className="text-muted-foreground cursor-pointer font-normal"
              >
                Modo conversación
              </Label>
              <Badge
                variant={conversationMode ? "default" : "secondary"}
                className="shrink-0"
              >
                {conversationMode ? "Conversación" : "Conciso"}
              </Badge>
            </div>
            <Switch
              id="etracker-conversation-mode"
              checked={conversationMode}
              onCheckedChange={setConversationMode}
            />
          </div>
          <p className="text-muted-foreground text-xs leading-snug">
            No inicia un chat ni cambia lo ya enviado: solo afecta al{" "}
            <strong>próximo</strong> mensaje que mandes. En <em>Conversación</em> el
            asistente puede saludar o explicar un poco más; en <em>Conciso</em> prioriza
            datos y un solo “siguiente paso”.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label
              htmlFor="etracker-voice-reply"
              className="text-muted-foreground cursor-pointer font-normal"
            >
              Respuesta en audio
            </Label>
            <Switch
              id="etracker-voice-reply"
              checked={voiceResponses}
              onCheckedChange={(v) => {
                setVoiceResponses(v);
                if (!v) {
                  ttsRequestedRef.current = new Set();
                  setVoiceUrlByMessageId({});
                  setTtsLoadingMessageId(null);
                }
              }}
            />
          </div>
        </div>
        <div
          className={cn(
            "flex-1 space-y-3 overflow-y-auto pr-2",
            layout === "fullscreen" && "min-h-0",
          )}
        >
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                audioSrc={m.role === "assistant" ? voiceUrlByMessageId[m.id] : undefined}
                audioLoading={
                  m.role === "assistant" && ttsLoadingMessageId === m.id
                }
              />
            ))
          )}
        </div>

        {error ? (
          <p className="text-sm text-red-600">
            {error.message ?? "Algo salió mal con el asistente."}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            ref={textareaRef}
            autoFocus
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Preguntá por tu mes, agregá un gasto, adjuntá captura, CSV (Revolut / extracto) o PDF."
            rows={2}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event as unknown as FormEvent);
              }
            }}
            disabled={isStreaming}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.csv,text/csv,application/csv,.pdf,application/pdf"
                multiple
                onChange={handleFiles}
                className="text-muted-foreground text-xs file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-foreground"
              />
              {files && files.length > 0 ? (
                <span className="text-muted-foreground text-xs">
                  {files.length} archivo{files.length === 1 ? "" : "s"}
                  {(() => {
                    const list = Array.from(files);
                    const bits: string[] = [];
                    if (list.some((f) => f.type.startsWith("image/"))) bits.push("imagen");
                    if (list.some((f) => f.name.toLowerCase().endsWith(".csv") || f.type.includes("csv")))
                      bits.push("CSV");
                    if (
                      list.some(
                        (f) =>
                          f.name.toLowerCase().endsWith(".pdf") || f.type.includes("pdf"),
                      )
                    )
                      bits.push("PDF");
                    return bits.length > 0 ? ` (${bits.join(", ")})` : "";
                  })()}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {isStreaming ? (
                <Button type="button" variant="outline" onClick={() => stop()}>
                  Detener
                </Button>
              ) : null}
              <Button type="submit" disabled={isStreaming}>
                Enviar
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
      <p className="text-foreground text-base font-medium">
        ¿Qué querés saber sobre tu mes?
      </p>
      <ul className="space-y-1">
        <li>· “¿Cuánto me queda este mes?”</li>
        <li>· “Agregá Netflix 8.99 USD al banco Visa.”</li>
        <li>· “Marcá el alquiler como pagado.”</li>
        <li>
          · Adjuntá captura del banco, CSV de movimientos (p. ej. Revolut) o PDF con texto
          seleccionable.
        </li>
      </ul>
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
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
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
              // Inline preview of attached images; the model already received
              // them as part of the user turn.
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={part.url}
                  alt={part.filename ?? "Adjunto"}
                  className="max-h-64 rounded-lg"
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
                  Preparando gráfico…
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
                  {`Usando herramienta: ${toolName}…`}
                </p>
              );
            }
            return null;
          })}
          {!isUser && audioLoading ?
            <p className="text-muted-foreground text-xs italic">Generando audio…</p>
          : null}
          {!isUser && audioSrc ?
            <audio
              controls
              className="mt-1 h-9 w-full max-w-[min(100%,20rem)]"
              src={audioSrc}
              preload="metadata"
            />
          : null}
        </div>
      </div>
    </div>
  );
}
