import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Map of business-error string codes to HTTP messages. Throw `new Error(code)`
 * from a handler and `withApi` will translate it to the right status here.
 *
 * Keep codes ALL_CAPS_SNAKE so they don't collide with random strings.
 */
const BUSINESS_ERRORS: Record<string, { status: number; message: string }> = {
  UNAUTHORIZED: { status: 401, message: "Unauthorized." },
  FORBIDDEN: { status: 403, message: "Forbidden." },
  USER_NOT_FOUND: { status: 404, message: "User not found." },
  SOURCE_NOT_FOUND: {
    status: 404,
    message: "The source month does not exist or is not set up yet.",
  },
  NO_RECORD: { status: 404, message: "This month is not set up yet." },
  ENABLE_BANKING_NOT_CONFIGURED: {
    status: 503,
    message: "Open Banking is not configured.",
  },
  OPEN_BANKING_DISABLED: {
    status: 403,
    message: "Open Banking is not enabled.",
  },
  CONNECTION_NOT_FOUND: { status: 404, message: "Bank connection not found." },
};

type ApiHandler<T> = () => Promise<T>;

/**
 * Wraps a route handler and returns a `Response`. Centralizes:
 *  - Zod parse errors           -> 400 with the first issue
 *  - `Error("UNAUTHORIZED")`    -> 401
 *  - business string codes      -> mapped status (see BUSINESS_ERRORS)
 *  - `Prisma.PrismaClient*Error`-> P2002 -> 409, P2025 -> 404, init -> 500
 *  - everything else            -> 500 (logged)
 *
 * Handlers may also return a `Response` directly (e.g. streamed responses);
 * in that case the wrapper passes it through untouched.
 */
export async function withApi<T>(handler: ApiHandler<T>): Promise<Response> {
  try {
    const result = await handler();
    if (result instanceof Response) return result;
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error) {
      const business = BUSINESS_ERRORS[error.message];
      if (business) {
        return jsonError(business.message, business.status);
      }
      if (error.message.includes("Invalid month format")) {
        return jsonError("Month must be in yyyy-MM format.", 400);
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return jsonError("Already exists.", 409);
      }
      if (error.code === "P2025") {
        return jsonError("Not found.", 404);
      }
    }
    if (
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientRustPanicError
    ) {
      return jsonError(
        "Could not connect to the database. Check DATABASE_URL.",
        500,
      );
    }
    console.error("[etracker.api] unhandled", error);
    return jsonError("Internal error.", 500);
  }
}
