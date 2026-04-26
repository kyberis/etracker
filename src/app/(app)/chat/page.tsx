import { ChatExperience } from "@/components/chat-experience";

export default function ChatPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">eTracker Assistant</h1>
        <p className="text-muted-foreground text-sm">
          Hablá con tu asistente de gastos. Podés consultar el mes, agregar
          gastos o adjuntar una captura de tu banco para que la procese.
        </p>
      </div>
      <ChatExperience />
    </div>
  );
}
