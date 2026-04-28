import type { FetchFunction } from "@ai-sdk/provider-utils";

/**
 * Extra HTTP retries for OpenAI transports (responses/chat).
 * Helps when TPM/RPM spikes return 429 (OpenAI recomienda Retry-After vía headers).
 *
 * Independent of AI SDK streamText retries (those wrap each model call attempt).
 */

const ATTEMPTS = Math.max(
  2,
  Math.min(Number.parseInt(process.env.OPENAI_TRANSPORT_RETRIES ?? "6", 10) || 6, 20),
);

const RETRY_STATUSES = new Set([408, 409, 429, 503, 529]);

function parseRetryDelayMs(res: Response): number | undefined {
  const msHdr = res.headers.get("retry-after-ms");
  if (msHdr) {
    const n = Number.parseFloat(msHdr);
    if (!Number.isNaN(n) && n >= 0) return Math.min(n, 120_000);
  }
  const ra = res.headers.get("retry-after");
  if (!ra) return undefined;
  const sec = Number.parseFloat(ra);
  if (!Number.isNaN(sec)) return Math.min(sec * 1000, 120_000);
  const parsed = Date.parse(ra);
  if (!Number.isNaN(parsed)) {
    return Math.min(Math.max(0, parsed - Date.now()), 120_000);
  }
  return undefined;
}

function exponentialFallbackMs(attempt: number): number {
  return Math.min(2000 * 1.4 ** attempt, 45_000);
}

async function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(id);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {
    try {
      response.body?.cancel();
    } catch {
      /* ignore */
    }
  }
}

export const resilientOpenAiFetch: FetchFunction = async (
  url: Parameters<FetchFunction>[0],
  init?: Parameters<FetchFunction>[1],
) => {
  const signal = init?.signal ?? undefined;
  let delayMsFallback = 2000;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const response = await globalThis.fetch(url, init);
    const canRetryLater = RETRY_STATUSES.has(response.status) && attempt + 1 < ATTEMPTS;
    if (!canRetryLater) {
      return response;
    }

    await discardBody(response);
    const fromHeader =
      parseRetryDelayMs(response) ?? exponentialFallbackMs(attempt + (response.status === 429 ? 0 : 1));
    const wait = Math.max(fromHeader, delayMsFallback);
    await sleep(wait, signal);
    delayMsFallback = Math.min(delayMsFallback * 1.4, 45_000);
  }

  throw new Error("OpenAI HTTP transport: retries exhausted without returning.");
};
