const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

export const LIBPQ_ROUTING_VARIABLES = [
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGDATABASE",
  "PGSERVICE",
  "PGSERVICEFILE",
] as const;

const DEPLOYMENT_MARKERS = ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_DEPLOYMENT_ID", "VERCEL_PROJECT_ID"] as const;

export const LOCAL_OPERATOR_SEED_OPT_IN = "HOSTED_AI_LOCAL_OPERATOR_SEED_ENABLED";

type DatabaseEnvironment = Record<string, string | undefined>;

export function databaseUrlFromEnvironment(environment: DatabaseEnvironment): string {
  const databaseUrl = environment.DIRECT_URL?.trim() || environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL or DIRECT_URL must be configured.");

  return databaseUrl;
}

function assertLocalDatabaseUrl(name: "DATABASE_URL" | "DIRECT_URL", value: string): string {
  const normalized = value.trim();
  if (normalized.includes("?") || normalized.includes("#"))
    throw new Error(`${name} must not contain query parameters or a fragment.`);

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) throw new Error(`${name} must use PostgreSQL.`);
  if (!LOOPBACK_HOSTNAMES.has(url.hostname))
    throw new Error(`${name} must use an exact loopback host (localhost, 127.0.0.1, or ::1).`);

  return normalized;
}

export function assertLocalDatabaseEnvironment(environment: DatabaseEnvironment): string {
  for (const name of LIBPQ_ROUTING_VARIABLES) {
    if (environment[name] !== undefined && environment[name] !== "")
      throw new Error(`${name} must be unset because libpq routing options can redirect the connection.`);
  }

  const databaseUrl = environment.DATABASE_URL?.trim();
  const directUrl = environment.DIRECT_URL?.trim();
  if (!databaseUrl && !directUrl)
    throw new Error("DATABASE_URL or DIRECT_URL must be configured for the local-only database operation.");

  const validatedDatabaseUrl = databaseUrl ? assertLocalDatabaseUrl("DATABASE_URL", databaseUrl) : undefined;
  const validatedDirectUrl = directUrl ? assertLocalDatabaseUrl("DIRECT_URL", directUrl) : undefined;

  return validatedDirectUrl ?? validatedDatabaseUrl!;
}

export function requireSingleLocalDatabase(environment: DatabaseEnvironment): string {
  for (const marker of DEPLOYMENT_MARKERS)
    if (environment[marker] !== undefined) throw new Error("Local-only database work is forbidden in a deployment environment.");
  const selected = new URL(assertLocalDatabaseEnvironment(environment));
  let database: URL;
  try {
    database = new URL(environment.DATABASE_URL?.trim() ?? "");
  } catch {
    throw new Error("DATABASE_URL must be a valid URL.");
  }
  if (!POSTGRES_PROTOCOLS.has(database.protocol) || !LOOPBACK_HOSTNAMES.has(database.hostname))
    throw new Error("DATABASE_URL must point at a loopback PostgreSQL host.");
  if ((database.port || "5432") !== (selected.port || "5432") || database.pathname !== selected.pathname)
    throw new Error("DATABASE_URL and DIRECT_URL must address the same local database.");
  return selected.href;
}

export function isStrictlyLocalDatabaseEnvironment(environment: DatabaseEnvironment): boolean {
  try {
    assertLocalDatabaseEnvironment(environment);
    return true;
  } catch {
    return false;
  }
}

export function shouldIncludeLocalOperatorAccess(environment: DatabaseEnvironment): boolean {
  return (
    environment[LOCAL_OPERATOR_SEED_OPT_IN] === "true" &&
    environment.NODE_ENV !== "production" &&
    !environment.VERCEL &&
    !environment.VERCEL_ENV &&
    !environment.CI &&
    isStrictlyLocalDatabaseEnvironment(environment)
  );
}

export function shouldIncludeOperatorSeedAccess(environment: DatabaseEnvironment): boolean {
  return shouldIncludeLocalOperatorAccess(environment);
}
