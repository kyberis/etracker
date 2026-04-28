/**
 * Next.js instrumentation hook — runs once at server startup.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 *
 * Tightens undici's TCP connect timeout so unreachable IPs in a DNS round-robin
 * (e.g. AI Gateway) fail fast and the AI SDK's retry budget can rotate through
 * other addresses instead of burning 10s per attempt on a dead IP.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { Agent, setGlobalDispatcher } = await import("undici");

  setGlobalDispatcher(
    new Agent({
      connect: {
        timeout: Number(process.env.UNDICI_CONNECT_TIMEOUT_MS ?? 3_000),
      },
      headersTimeout: 60_000,
      bodyTimeout: 120_000,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    }),
  );
}
