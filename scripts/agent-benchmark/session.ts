import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma";

const COOKIE_NAME = "app.session_token";
const SESSION_LIFETIME_MS = 6 * 60 * 60 * 1000;

export async function mintBenchmarkSession(prisma: PrismaClient, authUserId: string): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new Error("BETTER_AUTH_SECRET must be configured to mint a benchmark session.");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await prisma.authSession.create({ data: { id: randomUUID(), token, userId: authUserId, expiresAt } });
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${COOKIE_NAME}=${encodeURIComponent(`${token}.${signature}`)}`;
}
