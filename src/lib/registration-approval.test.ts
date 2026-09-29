import { afterEach, describe, expect, it } from "vitest";
import { UserKind } from "@prisma/client";

import {
  createRegistrationApprovalJwt,
  isRegistrationApproved,
  requiresRegistrationApproval,
  verifyRegistrationApprovalJwt,
} from "./registration-approval";

describe("Clara registration approval", () => {
  afterEach(() => {
    delete process.env.REGISTRATION_REQUIRES_APPROVAL;
  });

  it("defaults the gate on", () => {
    delete process.env.REGISTRATION_REQUIRES_APPROVAL;
    expect(requiresRegistrationApproval()).toBe(true);
  });

  it("exempts GUEST accounts", () => {
    expect(
      isRegistrationApproved({ kind: UserKind.GUEST, registrationApprovedAt: null }),
    ).toBe(true);
  });

  it("requires a timestamp for REGULAR users when the gate is on", () => {
    process.env.REGISTRATION_REQUIRES_APPROVAL = "true";
    expect(
      isRegistrationApproved({ kind: UserKind.REGULAR, registrationApprovedAt: null }),
    ).toBe(false);
    expect(
      isRegistrationApproved({
        kind: UserKind.REGULAR,
        registrationApprovedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("round-trips the approval JWT", async () => {
    process.env.NEXTAUTH_SECRET = "test-clara-secret";
    const token = await createRegistrationApprovalJwt({
      userId: "u1",
      email: "a@example.com",
    });
    expect(await verifyRegistrationApprovalJwt(token)).toEqual({
      userId: "u1",
      email: "a@example.com",
    });
  });
});
