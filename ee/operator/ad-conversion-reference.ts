import { env } from "@/env";

export function adConversionReferenceSecret(): string {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new Error("A conversion reference cannot be derived without BETTER_AUTH_SECRET");
  return `ad-conversion-reference:v1:${secret}`;
}
