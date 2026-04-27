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
 * Twilio signs the **exact** URL it POSTed to. Behind reverse proxies the
 * `Host` / `x-forwarded-*` headers sometimes disagree with that string by one
 * character (https vs http, port, first vs last value in a comma-separated
 * list), which makes validation fail and the handler return 401 before any
 * business logic runs — looks like "no logs, no WhatsApp reply".
 *
 * Optional: set `TWILIO_WEBHOOK_PUBLIC_URL` to the same string you pasted in
 * the Twilio console (including path, no trailing slash unless Twilio has one).
 *
 * For **message status callbacks** (different path), set
 * `TWILIO_STATUS_CALLBACK_PUBLIC_URL` to the URL configured under "Status
 * callback URL" in Twilio so signature checks match behind proxies.
 */
export type TwilioWebhookUrlRole = "inbound" | "status";

export function candidateWebhookUrls(
  request: Request,
  role: TwilioWebhookUrlRole = "inbound",
): string[] {
  const url = new URL(request.url);
  const pathWithQuery = url.pathname + url.search;

  const out: string[] = [];

  if (role === "status") {
    const statusExplicit = process.env.TWILIO_STATUS_CALLBACK_PUBLIC_URL?.trim();
    if (statusExplicit) {
      out.push(statusExplicit);
    }
  } else {
    const explicit = process.env.TWILIO_WEBHOOK_PUBLIC_URL?.trim();
    if (explicit) {
      out.push(explicit);
    }
  }

  const hostCandidates = new Set<string>();
  const xfHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  if (xfHost) {
    for (const part of xfHost.split(",")) {
      const h = part.trim();
      if (h) hostCandidates.add(h);
    }
  }
  if (hostHeader?.trim()) hostCandidates.add(hostHeader.trim());
  if (url.host) hostCandidates.add(url.host);

  const protoCandidates = new Set<string>();
  const xfProto = request.headers.get("x-forwarded-proto");
  if (xfProto) {
    for (const part of xfProto.split(",")) {
      const p = part.trim();
      if (p) protoCandidates.add(p);
    }
  }
  const fromUrlProto = url.protocol.replace(":", "");
  if (fromUrlProto) protoCandidates.add(fromUrlProto);
  protoCandidates.add("https");
  protoCandidates.add("http");

  for (const proto of protoCandidates) {
    for (const host of hostCandidates) {
      let h = host;
      // Twilio typically signs without explicit :443 / :80.
      h = h.replace(/:(443|80)$/i, "");
      out.push(`${proto}://${h}${pathWithQuery}`);
    }
  }

  // Some setups configure a trailing slash in the console.
  const withSlash = pathWithQuery.endsWith("/") || pathWithQuery === "/";
  if (!withSlash) {
    const snapshot = [...out];
    for (const u of snapshot) {
      if (!u.endsWith("/")) out.push(`${u}/`);
    }
  }

  return [...new Set(out)];
}

/** Try each candidate URL until `validateRequest` succeeds. */
export function verifyTwilioWebhookRequest(
  signature: string | null,
  request: Request,
  params: Record<string, string>,
  role: TwilioWebhookUrlRole = "inbound",
): { ok: boolean; matchedUrl?: string } {
  if (!signature) return { ok: false };
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return { ok: false };

  for (const candidate of candidateWebhookUrls(request, role)) {
    if (twilio.validateRequest(token, signature, candidate, params)) {
      return { ok: true, matchedUrl: candidate };
    }
  }
  return { ok: false };
}

export type SendTwilioWhatsappOptions = {
  /** Public HTTPS URL(s) of audio (e.g. MP3) for voice-note style replies. */
  voiceMediaUrls?: string[];
};

/**
 * Send a plain-text WhatsApp message via Twilio REST. Twilio caps each message
 * at 1600 chars, so we segment longer payloads.
 *
 * With `voiceMediaUrls`, sends one message whose body is the first text chunk
 * and attaches the audio (WhatsApp shows it as a voice/media note).
 */
export async function sendTwilioWhatsapp(
  toPhone: string,
  text: string,
  opts?: SendTwilioWhatsappOptions,
): Promise<void> {
  const client = getClient();
  const from = getFrom();
  const to = withChannel(toPhone);
  const voiceUrls = opts?.voiceMediaUrls?.filter((u) => u.startsWith("https://")) ?? [];

  const chunks = chunkText(text || "(sin respuesta)", 1500);

  if (voiceUrls.length > 0) {
    const firstBody = chunks[0] ?? "(sin respuesta)";
    try {
      const result = await client.messages.create({
        from,
        to,
        body: firstBody,
        mediaUrl: voiceUrls,
      });
      console.log("[etracker.twilio] outbound_ok", {
        sid: result.sid,
        to,
        status: result.status,
        chars: firstBody.length,
        voiceAttachments: voiceUrls.length,
      });
    } catch (error) {
      const e = error as {
        code?: number;
        status?: number;
        message?: string;
        moreInfo?: string;
      };
      console.error("[etracker.twilio] outbound_failed", {
        to,
        from,
        code: e.code,
        status: e.status,
        message: e.message,
        moreInfo: e.moreInfo,
      });
      throw error;
    }

    for (let i = 1; i < chunks.length; i++) {
      try {
        const result = await client.messages.create({
          from,
          to,
          body: chunks[i],
        });
        console.log("[etracker.twilio] outbound_ok", {
          sid: result.sid,
          to,
          status: result.status,
          chars: chunks[i].length,
          segment: i + 1,
        });
      } catch (error) {
        const e = error as {
          code?: number;
          status?: number;
          message?: string;
          moreInfo?: string;
        };
        console.error("[etracker.twilio] outbound_failed", {
          to,
          from,
          code: e.code,
          status: e.status,
          message: e.message,
          moreInfo: e.moreInfo,
        });
        throw error;
      }
    }
    return;
  }

  for (const chunk of chunks) {
    try {
      const result = await client.messages.create({ from, to, body: chunk });
      console.log("[etracker.twilio] outbound_ok", {
        sid: result.sid,
        to,
        status: result.status,
        chars: chunk.length,
      });
    } catch (error) {
      // Twilio errors carry `code`, `status`, `moreInfo` — useful for
      // diagnosing sandbox-not-joined (63007), channel disabled, invalid
      // sender, etc.
      const e = error as {
        code?: number;
        status?: number;
        message?: string;
        moreInfo?: string;
      };
      console.error("[etracker.twilio] outbound_failed", {
        to,
        from,
        code: e.code,
        status: e.status,
        message: e.message,
        moreInfo: e.moreInfo,
      });
      throw error;
    }
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
