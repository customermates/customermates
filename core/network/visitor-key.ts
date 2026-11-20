import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { env } from "@/env";

export async function visitorKey(request?: { headers: Pick<Headers, "get"> }): Promise<string | null> {
  const list = request?.headers ?? (await headers());
  const forwarded =
    list
      .get("x-forwarded-for")
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];
  const platform = env.VERCEL_ENV ? list.get("x-vercel-forwarded-for")?.trim() : undefined;
  const address = platform || list.get("x-real-ip")?.trim() || forwarded.at(-1);
  return address ? createHash("sha256").update(address).digest("hex").slice(0, 32) : null;
}
