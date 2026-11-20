import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { env } from "@/env";

const BOUND_VERSION = "v2";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DERIVATION_INFO = "customermates-secret-box-v1";

export type SecretBoxFailure = "configuration" | "format" | "unreadable";

export class SecretBoxError extends Error {
  constructor(
    message: string,
    readonly failure: SecretBoxFailure,
  ) {
    super(message);
    this.name = "SecretBoxError";
  }
}

export type SecretBinding = readonly string[];

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
  if (key.byteLength !== KEY_BYTES)
    throw new SecretBoxError("SECRET_BOX_KEY must be 32 bytes, base64 encoded", "configuration");
  return key;
}

function derivedKey(): Uint8Array | null {
  if (!env.BETTER_AUTH_SECRET) return null;
  return new Uint8Array(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "", DERIVATION_INFO, KEY_BYTES));
}

function sealingKey(): Uint8Array {
  const key = configuredKey() ?? derivedKey();
  if (!key) throw new SecretBoxError("BETTER_AUTH_SECRET is required to seal secrets", "configuration");
  return key;
}

function openingKeys(): Uint8Array[] {
  const keys = [configuredKey(), derivedKey()].filter((key): key is Uint8Array => key !== null);
  if (keys.length === 0)
    throw new SecretBoxError("BETTER_AUTH_SECRET is required to open sealed secrets", "configuration");
  return keys;
}

function associatedData(binding: SecretBinding): Uint8Array {
  if (binding.length === 0 || binding.some((part) => !part))
    throw new SecretBoxError("A sealed value must be bound to its owner", "configuration");
  return bytes(Buffer.from(JSON.stringify(binding), "utf8"));
}

function decrypt(key: Uint8Array, aad: Uint8Array, iv: string, tag: string, data: string): string | null {
  try {
    const decipher = createDecipheriv(ALGORITHM, key, decode(iv), { authTagLength: TAG_BYTES });
    decipher.setAAD(aad);
    decipher.setAuthTag(decode(tag));
    return Buffer.concat([bytes(decipher.update(decode(data))), bytes(decipher.final())]).toString("utf8");
  } catch {
    return null;
  }
}

export function sealSecret(plain: string, binding: SecretBinding): string {
  const aad = associatedData(binding);
  const iv = bytes(randomBytes(IV_BYTES));
  const cipher = createCipheriv(ALGORITHM, sealingKey(), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const data = Buffer.concat([bytes(cipher.update(plain, "utf8")), bytes(cipher.final())]);
  const tag = bytes(cipher.getAuthTag());
  return [BOUND_VERSION, encode(iv), encode(tag), encode(bytes(data))].join(".");
}

export function openSecret(sealed: string, binding: SecretBinding): string {
  const [version, iv, tag, data, ...rest] = sealed.split(".");
  if (version !== BOUND_VERSION || !iv || !tag || !data || rest.length > 0)
    throw new SecretBoxError("The sealed value has an unknown format", "format");
  const aad = associatedData(binding);
  for (const key of openingKeys()) {
    const plain = decrypt(key, aad, iv, tag, data);
    if (plain !== null) return plain;
  }
  throw new SecretBoxError("The sealed value cannot be opened with this server's secret", "unreadable");
}

export function secretLast4(plain: string): string {
  return plain.slice(-4);
}
