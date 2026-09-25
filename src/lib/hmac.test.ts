import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "./hmac";

describe("firma HMAC n8n → dashboard", () => {
  it("accetta firma corretta, rifiuta corpo alterato, timestamp scaduto e segreto mancante", () => {
    const now = 1_800_000_000;
    const { timestamp, signature } = signPayload("s3cret", '{"a":1}', now);
    expect(verifySignature({ secret: "s3cret", rawBody: '{"a":1}', timestamp, signature, now }).ok).toBe(true);
    expect(verifySignature({ secret: "s3cret", rawBody: '{"a":2}', timestamp, signature, now }).ok).toBe(false);
    expect(verifySignature({ secret: "s3cret", rawBody: '{"a":1}', timestamp, signature, now: now + 301 }).ok).toBe(false);
    expect(verifySignature({ secret: undefined, rawBody: "", timestamp, signature, now }).ok).toBe(false);
    expect(verifySignature({ secret: "s3cret", rawBody: '{"a":1}', timestamp, signature: "zz", now }).ok).toBe(false);
  });
});
