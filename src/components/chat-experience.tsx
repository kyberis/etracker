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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { chartSpecSchema } from "@/lib/ai/chart-spec";

export function ChatExperience() {
  // Centralizing the chat instance so transport configuration sits next to the
  // hook and we can wire image attachments through `sendMessage({ files })`.
  const chat = useMemo(
    () =>
      new Chat({
        transport: new DefaultChatTransport({ api: "/api/chat" }),
      }),
    [],
  );
  const { messages, sendMessage, status, error, stop } = useChat({ chat });

  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasStreamingRef = useRef(false);

  const isStreaming = status === "submitted" || status === "streaming";

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
    if (!text && (!files || files.length === 0)) return;

    await sendMessage({
      text: text || "Imagen adjunta.",
      ...(files && files.length > 0 ? { files } : {}),
    });
    setInput("");
    clearFiles();
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(event.target.files);
  }

  return (
    <Card>
      <CardContent className="flex h-[70vh] flex-col gap-4">
        <div className="flex-1 space-y-3 overflow-y-auto pr-2">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
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
            placeholder="Preguntá por tu mes, agregá un gasto, o adjuntá una captura del banco."
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
                accept="image/*"
                multiple
                onChange={handleFiles}
                className="text-muted-foreground text-xs file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-foreground"
              />
              {files && files.length > 0 ? (
                <span className="text-muted-foreground text-xs">
                  {files.length} archivo{files.length === 1 ? "" : "s"}
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
        <li>· Adjuntá una captura del banco para registrarla.</li>
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

function MessageBubble({ message }: { message: UIMessage }) {
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
                <p key={i} className="whitespace-pre-wrap">
                  {part.text}
                </p>
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
        </div>
      </div>
    </div>
  );
}
