# LinkedIn — borrador (ES) · Clara launch

> Objetivo: post de lanzamiento personal · historia de origen + tech · CTA al final.

---

¡Bienvenida, Clara! 🎉

> Vos: "Pagué el alquiler hoy, $850"
> Clara: "Listo, marqué **Alquiler** como pagado. Te quedan **$1.240** para los gastos pendientes del mes."

Ahí no hay planilla. Hay una conversación que entiende PDF, captura del home banking y nota de voz por Telegram.

---

Todo empezó con una planilla de Google. Funcionaba bien desde el desktop, pero desde mobile era un dolor. Un día me pregunté: ¿y si simplemente le cuento a un modelo lo que gasté?

Así nació Clara. Y decidí hacerla open source porque hoy el código no es la barrera — tiene que ser accesible para todo el mundo.

La construí 100% con Cursor y Claude Opus 4.7. Un día de trabajo. Ese proceso me obligó a entender qué era realmente lo que necesitaba.

---

Qué es Clara: asistente financiera chat-first, open source (MIT), self-hosteable, con voz rioplatense y soporte inglés de fábrica. Tus datos en tu Postgres — sin telemetría ni "IA premium" como upsell.

Por qué a un dev/AI engineer le puede importar:

→ Agente multimodal real con 33 tools tipadas (Zod) que escriben directo en Prisma — el modelo planifica, llama tools y corta con límite de pasos. No es un chat que "interpreta" texto y después reparseás.

→ MCP de primera clase: servidor público (/api/mcp) + servidor por usuario con PAT (/api/mcp/user) para Claude Desktop, Cursor o cualquier cliente — rate limit por usuario y confirm: true en borrados, alineado a la UX web.

→ Telegram + AI Gateway: webhook verificado, fotos, voz, PDF, typing indicator; logs JSON con traceId, tokens y USD estimado por turno para cost tracking.

---

Clara es el primer agente del ecosistema de trefolio.com. Te ayuda a tomar conciencia de tus gastos — el primer paso hacia la independencia financiera.

Pronto llega Warren para ayudarte a gestionar tus activos en trefolio.com 👀

---

Podés usar la versión hosteada con 30 consultas/día gratis — más que suficiente para gestionar el mes.

Probala: clara.trefolio.com
Código: github.com/kyberis/etracker — si el enfoque te sirve, una ⭐ ayuda un montón.

Si lo probás, me encantaría un feedback por DM.

_(Carrusel sugerido: dashboard mensual → chat con propuesta antes de guardar → MCP en Claude Desktop → diagrama del README.)_
