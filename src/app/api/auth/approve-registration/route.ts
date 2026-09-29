import { db } from "@/lib/db";
import { sendRegistrationApprovedEmail } from "@/lib/registration-approved-email";
import { verifyRegistrationApprovalJwt } from "@/lib/registration-approval";

export const dynamic = "force-dynamic";

function html(title: string, body: string, ok: boolean): Response {
  return new Response(
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:72px auto;padding:0 20px;">
<h1 style="color:${ok ? "#0f172a" : "#b91c1c"}">${title}</h1>
<p>${body}</p>
</body></html>`,
    {
      status: ok ? 200 : 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const parsed = token ? await verifyRegistrationApprovalJwt(token) : null;
  if (!parsed) {
    return html(
      "Link inválido",
      "Este enlace de aprobación no es válido o venció.",
      false,
    );
  }

  const user = await db.user.findUnique({
    where: { id: parsed.userId },
    select: {
      id: true,
      email: true,
      locale: true,
      registrationApprovedAt: true,
    },
  });
  if (!user || user.email.toLowerCase() !== parsed.email.toLowerCase()) {
    return html("Usuario no encontrado", "Esa cuenta ya no existe.", false);
  }

  if (!user.registrationApprovedAt) {
    await db.user.update({
      where: { id: user.id },
      data: { registrationApprovedAt: new Date() },
    });
    void sendRegistrationApprovedEmail({
      email: user.email,
      locale: user.locale,
    });
    return html(
      "Cuenta habilitada",
      `${user.email} ya puede entrar a Clara. Le mandamos un email.`,
      true,
    );
  }

  return html(
    "Ya estaba habilitada",
    `${user.email} ya tenía la cuenta habilitada.`,
    true,
  );
}
