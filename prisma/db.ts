import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

import { getTenantUser, isTenantGuardBypassed } from "@/core/decorators/tenant-context";
import { IS_DEVELOPMENT } from "@/constants/env";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const basePrisma = globalForPrisma.prisma || new PrismaClient({ adapter });

function tenantError(model: string, operation: string, message: string): Error {
  return new Error(`${message} [model=${model}, operation=${operation}]`);
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
          model === "Apikey";

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

            return query(args);
        }

        if ("where" in args) {
          if (model !== "Company") {
            if (!args.where?.companyId) throw tenantError(model, operation, "companyId must be set in where");

            if (args.where.companyId !== companyId)
              throw tenantError(model, operation, "companyId does not match tenant in where");
          } else {
            if (!args.where?.id) throw tenantError(model, operation, "companyId (id) must be set in where for Company");

            if (args.where.id !== companyId)
              throw tenantError(model, operation, "companyId (id) does not match tenant in where for Company");
          }
        } else throw tenantError(model, operation, "where must be provided to enforce tenant scoping");

        return query(args);
      },
    },
  },
});

if (IS_DEVELOPMENT) globalForPrisma.prisma = basePrisma;

export type AppPrismaClient = typeof prisma;

export { prisma };
