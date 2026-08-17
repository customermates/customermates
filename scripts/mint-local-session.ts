import "dotenv/config";

import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma";

const COOKIE_NAME = "app.session_token";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function resolveEmail(argv: readonly string[]): string {
  const [email, ...rest] = argv;
  if (!email || rest.length > 0) {
    console.error("Usage: yarn dev:become <email>");
    process.exit(1);
  }

  return email.trim().toLowerCase();
}

function resolveLocalDatabaseUrl(): string {
  const databaseUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL must be configured.");

  const hostname = new URL(databaseUrl).hostname;
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new Error(
      `Refusing to run against a non-local database (host ${hostname}). This tool only ever targets a disposable local copy.`,
    );
  }

  return databaseUrl;
}

function resolveSecret(): string {
  if (process.env.APP_MODE?.trim() === "demo") {
    throw new Error(
      'APP_MODE is "demo", which replaces any session with the synthetic seed user on every request. Set APP_MODE="self-hosted" and restart the dev server first.',
    );
  }

  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new Error("BETTER_AUTH_SECRET must be configured.");

  return secret;
}

async function main(): Promise<void> {
  const email = resolveEmail(process.argv.slice(2));
  const databaseUrl = resolveLocalDatabaseUrl();
  const secret = resolveSecret();

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    const authUser = await prisma.authUser.findFirst({ where: { email } });
    if (!authUser) throw new Error(`No AuthUser found for ${email} in the local database.`);

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await prisma.authSession.create({ data: { id: randomUUID(), token, userId: authUser.id, expiresAt } });

    const signature = createHmac("sha256", secret).update(token).digest("base64");
    const cookie = encodeURIComponent(`${token}.${signature}`);

    console.log(`Signed in as ${email} until ${expiresAt.toISOString()}.`);
    console.log("");
    console.log("Run this in the browser console on the app origin, then reload:");
    console.log(`  document.cookie = "${COOKIE_NAME}=${cookie}; path=/; max-age=${SESSION_LIFETIME_MS / 1000}"`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
