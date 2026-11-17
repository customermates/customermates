import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { env } from "@/env";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const DERIVATION_INFO = "customermates-secret-box-v1";

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretBoxError";
  }
}

function bytes(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Uint8Array {
  return bytes(Buffer.from(value, "base64url"));
}

function configuredKey(): Uint8Array | null {
  if (!env.SECRET_BOX_KEY) return null;
  const key = bytes(Buffer.from(env.SECRET_BOX_KEY, "base64"));
  if (key.byteLength !== KEY_BYTES) throw new SecretBoxError("SECRET_BOX_KEY must be 32 bytes, base64 encoded");
  return key;
}

function derivedKey(): Uint8Array {
  if (!env.BETTER_AUTH_SECRET) throw new SecretBoxError("BETTER_AUTH_SECRET is required to seal secrets");
  return new Uint8Array(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "", DERIVATION_INFO, KEY_BYTES));
}

function boxKey(): Uint8Array {
  return configuredKey() ?? derivedKey();
}

export function sealSecret(plain: string): string {
  const iv = bytes(randomBytes(IV_BYTES));
  const cipher = createCipheriv(ALGORITHM, boxKey(), iv);
  const data = Buffer.concat([bytes(cipher.update(plain, "utf8")), bytes(cipher.final())]);
  const tag = bytes(cipher.getAuthTag());
  return [VERSION, encode(iv), encode(tag), encode(bytes(data))].join(".");
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, data, ...rest] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data || rest.length > 0)
    throw new SecretBoxError("The sealed value has an unknown format");
  const decipher = createDecipheriv(ALGORITHM, boxKey(), decode(iv));
  decipher.setAuthTag(decode(tag));
  try {
    return Buffer.concat([bytes(decipher.update(decode(data))), bytes(decipher.final())]).toString("utf8");
  } catch {
    throw new SecretBoxError("The sealed value cannot be opened with the configured key");
  }
}

export function secretLast4(plain: string): string {
  return plain.slice(-4);
}
