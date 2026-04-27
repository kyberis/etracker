import { ChatExperience } from "@/components/chat-experience";

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function ChatPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const month =
    typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : undefined;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">eTracker Assistant</h1>
        <p className="text-muted-foreground text-sm">
          Hablá con tu asistente de gastos. Podés consultar el mes, agregar
          gastos, adjuntar una captura del banco o un <strong>CSV</strong> de
          movimientos (export Revolut u otro banco) para que los procese.
        </p>
      </div>
      <ChatExperience activeMonth={month} />
    </div>
  );
}
