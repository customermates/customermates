import "dotenv/config";

import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, Status, SubscriptionStatus } from "@/generated/prisma";
import { isSubscriptionExpired } from "@/ee/subscription/entitlements";
import { mustVerifyEmail } from "@/features/auth/email-verification-grace";

const COOKIE_PREFIX = "app";
const COOKIE_NAME = `${COOKIE_PREFIX}.session_token`;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

type Relaxation = "verify-email" | "activate" | "complete-onboarding" | "activate-subscription";

const RELAXATIONS: readonly Relaxation[] = [
  "verify-email",
  "activate",
  "complete-onboarding",
  "activate-subscription",
];

type Options = {
  email: string;
  relaxations: Set<Relaxation>;
};

function usage(): never {
  const flags = RELAXATIONS.map((name) => `  --${name}`).join("\n");
  console.error(
    [
      "Usage: yarn dev:become <email> [--verify-email] [--activate] [--complete-onboarding] [--activate-subscription] [--relax-all]",
      "",
      "Mints a signed session cookie for an existing user in the LOCAL database.",
      "Without flags nothing is mutated: the imported account state is reported as-is.",
      "",
      "Optional state relaxations (each overwrites imported production state):",
      flags,
      "  --relax-all",
    ].join("\n"),
  );
  process.exit(1);
}

function parseOptions(argv: readonly string[]): Options {
  const [email, ...flags] = argv;
  if (!email || email.startsWith("--")) usage();

  const relaxations = new Set<Relaxation>();
  for (const flag of flags) {
    if (flag === "--relax-all") {
      for (const name of RELAXATIONS) relaxations.add(name);
      continue;
    }
    const name = flag.replace(/^--/, "") as Relaxation;
    if (!flag.startsWith("--") || !RELAXATIONS.includes(name)) {
      console.error(`Unknown option: ${flag}`);
      usage();
    }
    relaxations.add(name);
  }

  return { email: email.trim().toLowerCase(), relaxations };
}

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL must be configured.");
  return databaseUrl;
}

function assertLocalDestination(databaseUrl: string): void {
  const hostname = new URL(databaseUrl).hostname;
  if (LOCAL_HOSTNAMES.has(hostname)) return;

  throw new Error(
    `Refusing to run against a non-local database (host ${hostname}). This tool only ever targets a disposable local copy.`,
  );
}

function assertSessionModeSupported(): void {
  if (process.env.APP_MODE?.trim() !== "demo") return;

  throw new Error(
    'APP_MODE is "demo", which replaces any session with the synthetic seed user on every request. Set APP_MODE="self-hosted" and restart the dev server before minting a session.',
  );
}

function signCookieValue(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

async function main(): Promise<void> {
  const { email, relaxations } = parseOptions(process.argv.slice(2));

  const databaseUrl = resolveDatabaseUrl();
  assertLocalDestination(databaseUrl);
  assertSessionModeSupported();

  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new Error("BETTER_AUTH_SECRET must be configured.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    const authUser = await prisma.authUser.findFirst({ where: { email } });
    if (!authUser) throw new Error(`No AuthUser found for ${email} in the local database.`);

    if (relaxations.has("verify-email") && !authUser.emailVerified) {
      await prisma.authUser.update({ where: { id: authUser.id }, data: { emailVerified: true } });
      authUser.emailVerified = true;
      console.log("Relaxed: AuthUser.emailVerified set to true.");
    }

    const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });

    if (user && relaxations.has("activate") && user.status !== Status.active) {
      await prisma.user.update({ where: { id: user.id }, data: { status: Status.active } });
      user.status = Status.active;
      console.log("Relaxed: User.status set to active.");
    }

    if (user && relaxations.has("complete-onboarding") && user.onboardingWizardCompletedAt == null) {
      const onboardingWizardCompletedAt = new Date();
      await prisma.user.update({ where: { id: user.id }, data: { onboardingWizardCompletedAt } });
      user.onboardingWizardCompletedAt = onboardingWizardCompletedAt;
      console.log("Relaxed: User.onboardingWizardCompletedAt backfilled.");
    }

    if (user && relaxations.has("activate-subscription")) {
      await prisma.subscription.upsert({
        where: { companyId: user.companyId },
        create: { companyId: user.companyId, status: SubscriptionStatus.active, trialEndDate: null },
        update: { status: SubscriptionStatus.active, trialEndDate: null },
      });
      console.log("Relaxed: Subscription set to active.");
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await prisma.authSession.create({
      data: { id: randomUUID(), token, userId: authUser.id, expiresAt },
    });

    const state = await resolveExpectedAccountState(prisma, authUser, user);

    console.log("");
    console.log(`Minted a session for ${email} (expires ${expiresAt.toISOString()}).`);
    console.log(`Expected account state on first protected request: ${state.state}`);
    if (state.remedy) console.log(`  ${state.remedy}`);
    console.log("");
    console.log(`Cookie name:  ${COOKIE_NAME}`);
    console.log(`Cookie value: ${signCookieValue(token, secret)}`);
    console.log("");
    console.log("Set it in the browser console on the app origin, then reload:");
    console.log(
      `  document.cookie = "${COOKIE_NAME}=${signCookieValue(token, secret)}; path=/; max-age=${SESSION_LIFETIME_MS / 1000}"`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

type ExpectedState = { state: string; remedy?: string };

async function resolveExpectedAccountState(
  prisma: PrismaClient,
  authUser: { emailVerified: boolean; createdAt: Date },
  user: { status: Status; companyId: string; onboardingWizardCompletedAt: Date | null; role: { isSystemRole: boolean } | null } | null,
): Promise<ExpectedState> {
  if (mustVerifyEmail(authUser)) {
    return { state: "overdueVerification", remedy: "Redirects to /auth/verify-email. Re-run with --verify-email to bypass." };
  }
  if (!user) {
    return {
      state: "unregistered",
      remedy: "No User row matches this email, so the app redirects to /onboarding/wizard. The AuthUser exists but has no tenant identity.",
    };
  }
  if (user.status === Status.inactive) {
    return { state: "inactive", remedy: "Redirects to /auth/error?type=inactiveUser. Re-run with --activate to bypass." };
  }
  if (user.status === Status.pendingAuthorization) {
    return { state: "pending", remedy: "Redirects to /auth/pending. Re-run with --activate to bypass." };
  }
  if (user.role?.isSystemRole && user.onboardingWizardCompletedAt == null) {
    return { state: "onboarding", remedy: "Redirects to /onboarding/wizard. Re-run with --complete-onboarding to bypass." };
  }

  if (process.env.APP_MODE?.trim() !== "demo") {
    const subscription = await prisma.subscription.findUnique({ where: { companyId: user.companyId } });
    if (!subscription) {
      return {
        state: "error",
        remedy: "The company has no Subscription row and the route guard throws rather than redirecting. Re-run with --activate-subscription.",
      };
    }
    if (isSubscriptionExpired(subscription)) {
      return { state: "subscription", remedy: "Redirects to /subscription-expired. Re-run with --activate-subscription to bypass." };
    }
  }

  return { state: "allowed" };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
