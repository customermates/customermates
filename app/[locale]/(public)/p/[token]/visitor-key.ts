import { createHash } from "node:crypto";
import { headers } from "next/headers";

export async function visitorKey(): Promise<string | null> {
  const list = await headers();
  const address = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip");
  return address ? createHash("sha256").update(address).digest("hex").slice(0, 32) : null;
}
