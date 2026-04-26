import crypto from "node:crypto";

const GRAPH_VERSION = "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

/** Verify the `X-Hub-Signature-256` header that Meta sends on every webhook POST. */
export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  // Compare in constant time to avoid timing leaks.
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Send a plain-text message to the user. WhatsApp limits text to 4096 chars per message. */
export async function sendWhatsappText(toPhone: string, text: string): Promise<void> {
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = requireEnv("WHATSAPP_ACCESS_TOKEN");

  // Trim/segment in case the model produced an extra-long answer.
  const chunks = chunkText(text || "(sin respuesta)", 3500);
  for (const chunk of chunks) {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: { body: chunk },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>");
      throw new Error(`WhatsApp send failed: ${res.status} ${body}`);
    }
  }
}

/**
 * Fetch a media file from WhatsApp Cloud and return its bytes plus mediaType.
 * Two-step flow per Meta docs: GET /{media_id} → returns short-lived `url`;
 * then GET that URL with the bearer token to download the bytes.
 */
export async function fetchWhatsappMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const accessToken = requireEnv("WHATSAPP_ACCESS_TOKEN");
  const lookup = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!lookup.ok) return null;
  const meta = (await lookup.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;

  const file = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!file.ok) return null;
  const arrayBuffer = await file.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mediaType: meta.mime_type ?? file.headers.get("content-type") ?? "application/octet-stream",
  };
}

function chunkText(value: string, max: number): string[] {
  if (value.length <= max) return [value];
  const out: string[] = [];
  for (let i = 0; i < value.length; i += max) {
    out.push(value.slice(i, i + max));
  }
  return out;
}
