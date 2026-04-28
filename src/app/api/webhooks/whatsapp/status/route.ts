import { NextResponse } from "next/server";

import { log } from "@/lib/log";
import {
  candidateWebhookUrls,
  verifyTwilioWebhookRequest,
} from "@/lib/whatsapp/twilio";

/**
 * Twilio **status callback** for outbound (and optionally inbound) WhatsApp
 * messages: delivery lifecycle (queued, sent, delivered, read, failed, …).
 *
 * Configure in Twilio Console → Messaging → WhatsApp / your sender → Status
 * callback URL:
 *   {NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp/status
 *
 * Same signing rules as the inbound webhook; on Vercel set
 * `TWILIO_STATUS_CALLBACK_PUBLIC_URL` to that exact HTTPS URL if validation
 * fails.
 */

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "etracker-whatsapp-status-callback",
    ts: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    const signature = request.headers.get("x-twilio-signature");
    const auth = verifyTwilioWebhookRequest(signature, request, params, "status");

    if (!auth.ok) {
      const candidates = candidateWebhookUrls(request, "status");
      log.error("twilio.status_invalid_signature", {
        hasSignature: Boolean(signature),
        candidateCount: candidates.length,
        sampleCandidates: candidates.slice(0, 5),
        hint: "Set TWILIO_STATUS_CALLBACK_PUBLIC_URL in Vercel to the exact status callback URL from Twilio.",
      });
      return new NextResponse("Invalid signature", { status: 401 });
    }

    log.info("twilio.status", {
      messageSid: params.MessageSid,
      messageStatus: params.MessageStatus,
      errorCode: params.ErrorCode ?? null,
      errorMessage: params.ErrorMessage ?? null,
      to: params.To,
      from: params.From,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("twilio.status_post_fatal", {
      error: error instanceof Error ? { name: error.name, message: error.message } : error,
    });
    return new NextResponse(null, { status: 204 });
  }
}
