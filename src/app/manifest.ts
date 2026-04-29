import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Clara — Asistente financiera",
    short_name: "Clara",
    description:
      "Asistente financiera con IA. Planificá gastos, seguí tu balance mes a mes y chateá con tu plata.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "portrait",
    background_color: "#FBEFD3",
    theme_color: "#1B0F3A",
    lang: "es-AR",
    dir: "ltr",
    categories: ["finance", "productivity", "lifestyle"],
    icons: [
      {
        src: "/clara-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/clara-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/clara-icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Abrir el chat",
        short_name: "Chat",
        url: "/app",
        description: "Hablá con Clara para registrar un gasto.",
      },
      {
        name: "Mis bancos",
        short_name: "Bancos",
        url: "/banks",
        description: "Gestioná tus cuentas y bancos conectados.",
      },
      {
        name: "Plantillas",
        short_name: "Plantillas",
        url: "/expenses",
        description: "Editá tus gastos recurrentes.",
      },
    ],
  };
}
