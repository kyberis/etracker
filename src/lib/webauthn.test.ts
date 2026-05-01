import { describe, expect, it } from "vitest";

import {
  CHALLENGE_COOKIE_NAME,
  getChallengeFromCookieHeader,
} from "./webauthn";

describe("getChallengeFromCookieHeader", () => {
  it("returns null when the header is missing", () => {
    expect(getChallengeFromCookieHeader(null)).toBeNull();
    expect(getChallengeFromCookieHeader(undefined)).toBeNull();
    expect(getChallengeFromCookieHeader("")).toBeNull();
  });

  it("extracts the challenge cookie value", () => {
    const header = `foo=1; ${CHALLENGE_COOKIE_NAME}=abc123; bar=2`;
    expect(getChallengeFromCookieHeader(header)).toBe("abc123");
  });

  it("tolerates quoted values", () => {
    const header = `${CHALLENGE_COOKIE_NAME}="zzz"; other=1`;
    expect(getChallengeFromCookieHeader(header)).toBe("zzz");
  });

  it("ignores other cookies that share a substring", () => {
    const header = `not_${CHALLENGE_COOKIE_NAME}=trap; ${CHALLENGE_COOKIE_NAME}=real`;
    expect(getChallengeFromCookieHeader(header)).toBe("real");
  });

  it("returns null when the cookie is empty", () => {
    expect(getChallengeFromCookieHeader(`${CHALLENGE_COOKIE_NAME}=`)).toBeNull();
  });
});
