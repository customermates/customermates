import { createHash } from "node:crypto";
import { headers } from "next/headers";

export async function visitorKey(): Promise<string | null> {
  const list = await headers();
  const forwarded =
    list
      .get("x-forwarded-for")
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];
  const address = list.get("x-vercel-forwarded-for")?.trim() || list.get("x-real-ip")?.trim() || forwarded.at(-1);
  return address ? createHash("sha256").update(address).digest("hex").slice(0, 32) : null;
}
