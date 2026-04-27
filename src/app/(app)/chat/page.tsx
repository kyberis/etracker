import { ChatExperience } from "@/components/chat-experience";

export default function ChatPage() {
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
      <ChatExperience />
    </div>
  );
}
