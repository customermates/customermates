import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

import { getTenantUser, isTenantGuardBypassed } from "@/core/decorators/tenant-context";
import { env } from "@/env";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const basePrisma = globalForPrisma.prisma || new PrismaClient({ adapter });

const COMPANY_MODEL = "Company";

const AUTH_MODELS = new Set([
  "AuthUser",
  "AuthAccount",
  "AuthSession",
  "AuthVerification",
  "Apikey",
  "OauthApplication",
  "OauthAccessToken",
  "OauthConsent",
]);

type WhereScope = "unchecked" | "companyIdColumn" | "companyIdColumnOrCompoundKey";

const WHERE_SCOPE_BY_OPERATION: Record<string, WhereScope> = {
  create: "unchecked",
  createMany: "unchecked",
  update: "companyIdColumn",
  updateMany: "companyIdColumn",
  upsert: "companyIdColumnOrCompoundKey",
};

const DEFAULT_WHERE_SCOPE: WhereScope = "companyIdColumn";

function tenantError(model: string, operation: string, message: string): Error {
  return new Error(`${message} [model=${model}, operation=${operation}]`);
}

function companyIdOf(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return undefined;

  return (payload as Record<string, unknown>).companyId;
}

function assertPayloadOwned(model: string, operation: string, slot: string, payload: unknown, companyId: string) {
  const value = companyIdOf(payload);

  if (!value) throw tenantError(model, operation, `companyId must be set in ${slot}`);

  if (value !== companyId) throw tenantError(model, operation, `companyId does not match tenant in ${slot}`);
}

function assertPayloadNotForeign(model: string, operation: string, slot: string, payload: unknown, companyId: string) {
  const value = companyIdOf(payload);

  if (value !== undefined && value !== companyId)
    throw tenantError(model, operation, `companyId does not match tenant in ${slot}`);
}

function assertTenantPayload(model: string, operation: string, args: unknown, companyId: string) {
  if (model === COMPANY_MODEL) return;

  const input = (args ?? {}) as { data?: unknown; create?: unknown; update?: unknown };

  if (operation === "create") return assertPayloadOwned(model, operation, "data", input.data, companyId);

  if (operation === "createMany") {
    const rows = Array.isArray(input.data) ? input.data : [input.data];
    for (const row of rows) assertPayloadOwned(model, operation, "data", row, companyId);
    return;
  }

  if (operation === "upsert") {
    assertPayloadOwned(model, operation, "create", input.create, companyId);
    assertPayloadOwned(model, operation, "update", input.update, companyId);
    return;
  }

  if (operation === "update" || operation === "updateMany")
    assertPayloadNotForeign(model, operation, "data", input.data, companyId);
}

function compoundKeyCompanyId(where: Record<string, unknown>): string | undefined {
  for (const [key, value] of Object.entries(where)) {
    if (!key.includes("_") || !value || typeof value !== "object" || Array.isArray(value)) continue;

    const nested = (value as Record<string, unknown>).companyId;
    if (typeof nested === "string") return nested;
  }

  return undefined;
}

function assertTenantWhere(model: string, operation: string, args: unknown, companyId: string) {
  const scope = WHERE_SCOPE_BY_OPERATION[operation] ?? DEFAULT_WHERE_SCOPE;
  if (scope === "unchecked") return;

  if (!args || typeof args !== "object" || !("where" in args))
    throw tenantError(model, operation, "where must be provided to enforce tenant scoping");

  const where = (args as { where?: Record<string, unknown> }).where;

  if (model === COMPANY_MODEL) {
    if (!where?.id) throw tenantError(model, operation, "companyId (id) must be set in where for Company");

    if (where.id !== companyId)
      throw tenantError(model, operation, "companyId (id) does not match tenant in where for Company");

    return;
  }

  const column = where?.companyId;
  const scoped =
    typeof column === "string"
      ? column
      : scope === "companyIdColumnOrCompoundKey" && where
        ? compoundKeyCompanyId(where)
        : undefined;

  if (!scoped) throw tenantError(model, operation, "companyId must be set in where");

  if (scoped !== companyId) throw tenantError(model, operation, "companyId does not match tenant in where");
}

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (AUTH_MODELS.has(model)) return query(args);

        if (isTenantGuardBypassed()) return query(args);

        const { companyId } = getTenantUser();

        assertTenantPayload(model, operation, args, companyId);
        assertTenantWhere(model, operation, args, companyId);

        return query(args);
      },
    },
  },
});

if (env.NODE_ENV !== "production") globalForPrisma.prisma = basePrisma;

export type AppPrismaClient = typeof prisma;

export { prisma };
