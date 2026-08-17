import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

import { getTenantUser, isTenantGuardBypassed } from "@/core/decorators/tenant-context";
import { env } from "@/env";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const basePrisma = globalForPrisma.prisma || new PrismaClient({ adapter });

function tenantError(model: string, operation: string, message: string): Error {
  return new Error(`${message} [model=${model}, operation=${operation}]`);
}

function compoundSelectorCompanyId(where: Record<string, unknown>): string | undefined {
  for (const [key, value] of Object.entries(where)) {
    if (!key.includes("_") || !value || typeof value !== "object" || Array.isArray(value)) continue;

    const nested = (value as Record<string, unknown>).companyId;
    if (typeof nested === "string") return nested;
  }

  return undefined;
}

function assertTenantScopedWhere(
  model: string,
  operation: string,
  args: unknown,
  companyId: string,
  allowCompoundSelector: boolean,
) {
  if (!args || typeof args !== "object" || !("where" in args))
    throw tenantError(model, operation, "where must be provided to enforce tenant scoping");

  const where = (args as { where?: Record<string, unknown> }).where;

  if (model === "Company") {
    if (!where?.id) throw tenantError(model, operation, "companyId (id) must be set in where for Company");

    if (where.id !== companyId)
      throw tenantError(model, operation, "companyId (id) does not match tenant in where for Company");

    return;
  }

  const direct = where?.companyId;
  const scoped =
    typeof direct === "string"
      ? direct
      : allowCompoundSelector && where
        ? compoundSelectorCompanyId(where)
        : undefined;

  if (!scoped) throw tenantError(model, operation, "companyId must be set in where");

  if (scoped !== companyId) throw tenantError(model, operation, "companyId does not match tenant in where");
}

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        const isAuthModel =
          model === "AuthUser" ||
          model === "AuthAccount" ||
          model === "AuthSession" ||
          model === "AuthVerification" ||
          model === "Apikey" ||
          model === "OauthApplication" ||
          model === "OauthAccessToken" ||
          model === "OauthConsent";

        if (isAuthModel) return query(args);

        if (isTenantGuardBypassed()) return query(args);

        const { companyId } = getTenantUser();

        switch (operation) {
          case "create":
            if (model !== "Company") {
              if (!args.data?.companyId) throw tenantError(model, operation, "companyId must be set in data");

              if (args.data.companyId !== companyId)
                throw tenantError(model, operation, "companyId does not match tenant");
            }

            return query(args);

          case "update":
            if (model !== "Company") {
              if (args.data?.companyId && args.data.companyId !== companyId)
                throw tenantError(model, operation, "companyId does not match tenant");
            }

            assertTenantScopedWhere(model, operation, args, companyId, false);

            return query(args);

          case "createMany":
            if (model !== "Company") {
              const rows = Array.isArray(args.data) ? args.data : [args.data];

              for (const row of rows) {
                if (!row?.companyId) throw tenantError(model, operation, "companyId must be set in data");

                if (row.companyId !== companyId) throw tenantError(model, operation, "companyId does not match tenant");
              }
            }

            return query(args);

          case "updateMany":
            if (model !== "Company") {
              if (args.data?.companyId && args.data.companyId !== companyId)
                throw tenantError(model, operation, "companyId does not match tenant in data");
            }

            assertTenantScopedWhere(model, operation, args, companyId, false);

            return query(args);

          case "upsert":
            if (model !== "Company") {
              if (!args.create?.companyId) throw tenantError(model, operation, "companyId must be set in create");

              if (args.create.companyId !== companyId)
                throw tenantError(model, operation, "companyId does not match tenant in create");

              if (!args.update?.companyId) throw tenantError(model, operation, "companyId must be set in update");

              if (args.update.companyId !== companyId)
                throw tenantError(model, operation, "companyId does not match tenant in update");
            }

            assertTenantScopedWhere(model, operation, args, companyId, true);

            return query(args);
        }

        assertTenantScopedWhere(model, operation, args, companyId, false);

        return query(args);
      },
    },
  },
});

if (env.NODE_ENV !== "production") globalForPrisma.prisma = basePrisma;

export type AppPrismaClient = typeof prisma;

export { prisma };
