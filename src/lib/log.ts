/**
 * Tiny structured-log helper. Emits a single line per event, namespaced under
 * `etracker.<event>` with the JSON payload appended — easy to grep in Vercel
 * logs and stable to parse later.
 *
 * `warn` and `error` go to `console.error` so Vercel labels them at the right
 * level. When `SENTRY_DSN` is set, errors are also forwarded to
 * `@sentry/nextjs` via dynamic import — the package is *not* a hard dep, so
 * if it isn't installed the helper just no-ops.
 */
type LogPayload = Record<string, unknown> | undefined;

function deployContext(): Record<string, unknown> {
  return {
    vercelEnv: process.env.VERCEL_ENV,
    region: process.env.VERCEL_REGION,
    deployCommit:
      typeof process.env.VERCEL_GIT_COMMIT_SHA === "string"
        ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)
        : undefined,
    nodeEnv: process.env.NODE_ENV,
  };
}

function emit(level: "info" | "warn" | "error", event: string, data?: LogPayload) {
  const tag = `[etracker.${event}]`;
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    ...deployContext(),
    ...(data ?? {}),
  });
  if (level === "info") {
    console.log(tag, payload);
    return;
  }
  console.error(tag, payload);
}

async function forwardToSentry(error: unknown, event: string, data?: LogPayload) {
  if (!process.env.SENTRY_DSN) return;
  try {
    // `@sentry/nextjs` is intentionally not a hard dep — install it yourself
    // if you want errors to be forwarded. Using a variable specifier prevents
    // bundlers from trying to resolve it at build time.
    const moduleName = "@sentry/nextjs";
    const dynamicImport = Function("m", "return import(m)") as (
      m: string,
    ) => Promise<unknown>;
    const sentry = (await dynamicImport(moduleName).catch(() => null)) as
      | { captureException?: (e: unknown, ctx?: unknown) => void }
      | null;
    sentry?.captureException?.(error, { extra: { event, data } });
  } catch {
    /* best effort */
  }
}

export const log = {
  info(event: string, data?: LogPayload) {
    emit("info", event, data);
  },
  warn(event: string, data?: LogPayload) {
    emit("warn", event, data);
  },
  error(event: string, data?: LogPayload) {
    emit("error", event, data);
    void forwardToSentry(data?.error ?? data, event, data);
  },
};
