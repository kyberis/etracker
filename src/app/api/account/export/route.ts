import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { legalController } from "@/lib/legal";
import { limitByUser } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";

/**
 * GDPR Art. 15 (access) + Art. 20 (portability) endpoint.
 *
 * Streams a JSON dump of every personal-data row Clara stores for the
 * authenticated user. We strip authentication-bearer fields (`passwordHash`,
 * Account `access_token` / `refresh_token` / `id_token`, the API token
 * `tokenHash` and the WebAuthn `credentialPublicKey`) so the export is safe
 * to share with another service without leaking what would re-authenticate
 * the user. The remaining shape is intentionally close to the Prisma rows so
 * a third-party importer can map fields back without a translation table.
 *
 * Rate-limit: 3 / hour per user via Upstash. The dump is dominant DB work,
 * not CPU, but each call also re-pays JSON serialization on potentially
 * thousands of rows; the limit protects DB without surprising the user
 * (humans rarely export more than once an hour).
 */
export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();

    const limit = await limitByUser(
      "account-export",
      userId,
      3,
      "1 h",
      "You've reached the hourly export limit. Try again later.",
    );
    if (!limit.ok) return limit.response;

    const [
      user,
      banks,
      expenses,
      incomes,
      monthRecords,
      monthExpenseLines,
      monthIncomeLines,
      savingsMovements,
      webChatMessages,
      telegramMessages,
      apiTokens,
      passkeys,
      donations,
      agentMessageUsage,
      agentDailyModelUsage,
      activeDays,
      featureFlagOverrides,
      contactMessages,
      bankConnections,
    ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerified: true,
          image: true,
          isAdmin: true,
          isActive: true,
          dailyAgentMessageLimit: true,
          monthlyIncome: true,
          savings: true,
          primaryCurrency: true,
          primaryCurrencyConfirmedAt: true,
          telegramUserId: true,
          telegramUsername: true,
          telegramChatId: true,
          telegramVerifiedAt: true,
          expenseImportInstructions: true,
          welcomedAt: true,
          country: true,
          usageReasons: true,
          onboardingCompletedAt: true,
          locale: true,
          lastSeenAt: true,
          subscriptionStatus: true,
          subscriptionCurrentPeriodEnd: true,
          acceptedTermsAt: true,
          acceptedTermsVersion: true,
          createdAt: true,
          updatedAt: true,
          accounts: {
            select: {
              id: true,
              provider: true,
              providerAccountId: true,
              type: true,
              scope: true,
              expires_at: true,
            },
          },
        },
      }),
      db.bank.findMany({ where: { userId } }),
      db.expense.findMany({ where: { userId } }),
      db.income.findMany({ where: { userId } }),
      db.monthRecord.findMany({ where: { userId } }),
      db.monthExpenseLine.findMany({ where: { userId } }),
      db.monthIncomeLine.findMany({ where: { userId } }),
      db.savingsMovement.findMany({ where: { userId } }),
      db.webChatMessage.findMany({ where: { userId } }),
      db.telegramMessage.findMany({ where: { userId } }),
      db.apiToken.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          prefix: true,
          createdAt: true,
          updatedAt: true,
          lastUsedAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      }),
      db.passkey.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          deviceType: true,
          backedUp: true,
          transports: true,
          counter: true,
          createdAt: true,
          lastUsedAt: true,
        },
      }),
      db.donation.findMany({ where: { userId } }),
      db.agentMessageUsage.findMany({ where: { userId } }),
      db.agentDailyModelUsage.findMany({ where: { userId } }),
      db.dailyActiveUser.findMany({ where: { userId } }),
      db.featureFlagOverride.findMany({ where: { userId } }),
      db.contactMessage.findMany({
        where: { userId },
        select: {
          id: true,
          kind: true,
          name: true,
          email: true,
          body: true,
          createdAt: true,
          readAt: true,
          repliedAt: true,
          archivedAt: true,
        },
      }),
      db.bankConnection.findMany({
        where: { userId },
        select: {
          id: true,
          provider: true,
          institutionName: true,
          institutionCountry: true,
          status: true,
          validUntil: true,
          lastSyncAt: true,
          createdAt: true,
          accounts: {
            select: {
              id: true,
              ibanMasked: true,
              name: true,
              currency: true,
              bankId: true,
            },
          },
          importedTx: {
            select: {
              id: true,
              externalId: true,
              monthLineId: true,
              lineType: true,
              ignored: true,
              importedAt: true,
            },
          },
        },
      }),
    ]);

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const controller = legalController();
    const exportedAt = new Date().toISOString();
    const dump = {
      _meta: {
        schemaVersion: "1.0",
        exportedAt,
        controller: {
          name: controller.name,
          jurisdiction: controller.jurisdiction,
        },
        notes: [
          "Clara dump per GDPR Art. 15 / Art. 20.",
          "Authentication secrets (passwordHash, OAuth tokens, MCP token hashes, WebAuthn public keys, Open Banking session ids) are intentionally omitted.",
          "Decimals are serialised as strings to preserve precision.",
        ],
      },
      user,
      banks,
      expenses,
      incomes,
      monthRecords,
      monthExpenseLines,
      monthIncomeLines,
      savingsMovements,
      webChatMessages,
      telegramMessages,
      apiTokens,
      passkeys,
      donations,
      agentMessageUsage,
      agentDailyModelUsage,
      activeDays,
      featureFlagOverrides,
      contactMessages,
      bankConnections,
    };

    const filename = `clara-export-${userId}-${exportedAt.slice(0, 10)}.json`;
    return new NextResponse(serialize(dump), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  });
}

/**
 * `JSON.stringify` doesn't know how to serialise `Decimal` (Prisma) or
 * `BigInt` (Telegram ids). We coerce both to strings so the dump round-trips
 * losslessly through any JSON parser. Dates are handled by their default
 * `toJSON` -> ISO 8601.
 */
function serialize(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (
        v &&
        typeof v === "object" &&
        "constructor" in v &&
        (v as { constructor?: { name?: string } }).constructor?.name === "Decimal"
      ) {
        return (v as { toString(): string }).toString();
      }
      return v;
    },
    2,
  );
}
