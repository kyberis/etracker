import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function encryptionKey(): Buffer {
  const raw = process.env.BANK_SYNC_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("ENABLE_BANKING_NOT_CONFIGURED");
  }
  return Buffer.from(raw, "hex");
}

/**
 * AES-256-GCM. Output is `iv:tag:ciphertext` hex so it stores cleanly in
 * a Prisma String column.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("INVALID_CIPHERTEXT");
  }
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(
    ALGO,
    encryptionKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function isEncryptionConfigured(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(
    process.env.BANK_SYNC_ENCRYPTION_KEY?.trim() ?? "",
  );
}
