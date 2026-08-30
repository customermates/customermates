import { randomUUID } from "node:crypto";

import { z } from "zod";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { Status } from "@/generated/prisma";
import { env } from "@/env";

import { OperatorConflictError, OperatorNotFoundError } from "./operator.errors";
import { normalizeOperatorEmail } from "./operator-access.service";
import { OPERATOR_AUDIT_ACTION } from "./operator.schema";

const EmailSchema = z.string().trim().max(320).pipe(z.email());

export type OperatorBootstrapResult = {
  userId: string;
  companyId: string;
  email: string;
  auditOperationId: string;
};

export class PrismaOperatorBootstrapService extends BaseRepository {
  @BypassTenantGuard
  async bootstrapFirstOperatorUnscoped(args: {
    email: string;
    confirmationEmail: string;
  }): Promise<OperatorBootstrapResult> {
    if (env.APP_MODE !== "cloud") throw new OperatorConflictError("Platform operators only exist in cloud mode.");

    const email = normalizeOperatorEmail(EmailSchema.parse(args.email));
    if (normalizeOperatorEmail(args.confirmationEmail) !== email)
      throw new OperatorConflictError("The confirmation email does not match.");

    return runInTransaction(async () => {
      await this.prisma
        .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('customermates:first-operator-bootstrap', 0))`;

      if (
        (await this.prisma.user.count({
          where: { isPlatformOperator: true, status: Status.active },
        })) !== 0
      )
        throw new OperatorConflictError("An active operator already exists; first-operator bootstrap is closed.");

      const users = await this.prisma.user.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        take: 2,
        select: { id: true, companyId: true, email: true, status: true },
      });
      if (users.length !== 1) {
        if (users.length > 1) throw new OperatorConflictError("The normalized email matches multiple users.");
        throw new OperatorNotFoundError("No domain user matches that email.");
      }
      const user = users[0];
      if (user.status !== Status.active) throw new OperatorConflictError("The bootstrap user must be active.");

      const authUsers = await this.prisma.authUser.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        take: 2,
        select: { id: true, companyId: true, emailVerified: true },
      });
      if (authUsers.length !== 1) {
        if (authUsers.length > 1) throw new OperatorConflictError("The normalized email matches multiple auth users.");
        throw new OperatorNotFoundError("No auth user matches that email.");
      }
      const authUser = authUsers[0];
      if (!authUser.emailVerified) throw new OperatorConflictError("The bootstrap user's email must be verified.");
      if (authUser.companyId !== user.companyId)
        throw new OperatorConflictError("The auth and domain users do not belong to the same company.");

      const operationId = randomUUID();
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isPlatformOperator: true },
      });
      await this.prisma.operatorAuditEvent.create({
        data: {
          actorUserId: user.id,
          action: OPERATOR_AUDIT_ACTION.operatorBootstrap,
          targetCompanyId: user.companyId,
          targetUserId: user.id,
          operationId,
          reason: "First platform operator bootstrap",
          metadata: { interactive: true },
        },
      });

      return {
        userId: user.id,
        companyId: user.companyId,
        email: user.email,
        auditOperationId: operationId,
      };
    });
  }
}
