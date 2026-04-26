import twilio from "twilio";

const WHATSAPP_PREFIX = "whatsapp:";

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error(
      "Missing Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)",
    );
  }
  return twilio(sid, token);
}

function getFrom(): string {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) {
    throw new Error("Missing TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886)");
  }
  return from.startsWith(WHATSAPP_PREFIX) ? from : `${WHATSAPP_PREFIX}${from}`;
}

/** Ensure a phone reaches Twilio with the `whatsapp:` channel prefix. */
function withChannel(toPhone: string): string {
  return toPhone.startsWith(WHATSAPP_PREFIX)
    ? toPhone
    : `${WHATSAPP_PREFIX}${toPhone}`;
}

/**
 * Verify Twilio's `X-Twilio-Signature` header. Twilio computes:
 *   base64(HMAC-SHA1(authToken, url + sortedParamsConcat))
 * We pass the public URL Twilio called (incl. query string) and the parsed
 * form params; the SDK does the comparison in constant time.
 */
export function verifyTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  return twilio.validateRequest(token, signature, url, params);
}

/**
 * Reconstruct the public URL Twilio used to call us. Vercel terminates TLS so
 * we trust `x-forwarded-proto` / `x-forwarded-host` when present, falling back
 * to the URL Next.js parsed from the incoming request.
 */
export function buildPublicUrl(request: Request): string {
  const url = new URL(request.url);
  const proto =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  return `${proto}://${host}${url.pathname}${url.search}`;
}

/**
 * Send a plain-text WhatsApp message via Twilio REST. Twilio caps each message
 * at 1600 chars, so we segment longer payloads.
 */
export async function sendTwilioWhatsapp(
  toPhone: string,
  text: string,
): Promise<void> {
  const client = getClient();
  const from = getFrom();
  const to = withChannel(toPhone);
  const chunks = chunkText(text || "(sin respuesta)", 1500);
  for (const chunk of chunks) {
    await client.messages.create({ from, to, body: chunk });
  }
}

/**
 * Download a Twilio media file. Media URLs require Basic Auth with the account
 * SID + token; Twilio responds with a 302 to a signed CDN URL, which `fetch`
 * follows automatically.
 */
export async function fetchTwilioMedia(
  mediaUrl: string,
): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(mediaUrl, { headers: { Authorization: auth } });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  const mediaType =
    res.headers.get("content-type") ?? "application/octet-stream";
  return { buffer, mediaType };
}

function chunkText(value: string, max: number): string[] {
  if (value.length <= max) return [value];
  const out: string[] = [];
  for (let i = 0; i < value.length; i += max) {
    out.push(value.slice(i, i + max));
  }
  return out;
}
