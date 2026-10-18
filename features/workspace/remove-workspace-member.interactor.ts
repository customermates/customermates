import type { Data, Validated } from "@/core/validation/validation.utils";
import type { GetCompanyRepo } from "@/features/company/get-company.repo";
import type { EmailService } from "@/features/email/email.service";
import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { MemberRemovalRefusal } from "./member-removal-refusal";
import type { RemovableWorkspaceMember, RemoveWorkspaceMemberRepo } from "./remove-workspace-member.repo";
import type { WorkspaceDepartureService } from "./workspace-departure.service";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { createElement } from "react";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { Resource, Status } from "@/generated/prisma";

import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import WorkspaceRemovalNotice from "@/components/emails/workspace-removal-notice";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import {
  fail,
  failAuthorization,
  failConflict,
  failNotFound,
  unwoundFailure,
} from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { MEMBER_REMOVAL_REFUSAL_CODES, memberRemovalRefusal } from "./member-removal-refusal";

export const RemoveWorkspaceMemberSchema = z.object({
  userId: z.uuid().optional(),
  email: z.email().optional(),
});
export type RemoveWorkspaceMemberData = Data<typeof RemoveWorkspaceMemberSchema>;

export const RemovedWorkspaceMemberSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  previousStatus: z.enum(Status),
});
export type RemovedWorkspaceMember = Data<typeof RemovedWorkspaceMemberSchema>;

function refuse(refusal: MemberRemovalRefusal, path: string[]) {
  const code = MEMBER_REMOVAL_REFUSAL_CODES[refusal];
  return refusal === "self" || refusal === "platformOperator"
    ? failAuthorization(code, path)
    : failConflict(code, path);
}

@TenantInteractor({ resource: Resource.users, manage: "update" })
export class RemoveWorkspaceMemberInteractor extends AuthenticatedInteractor<
  RemoveWorkspaceMemberData,
  RemovedWorkspaceMember
> {
  constructor(
    private readonly repo: RemoveWorkspaceMemberRepo,
    private readonly roleRepo: UpdateUserRoleRepo,
    private readonly memberships: WorkspaceMembershipRepo,
    private readonly departure: WorkspaceDepartureService,
    private readonly companyRepo: GetCompanyRepo,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  @Validate(RemoveWorkspaceMemberSchema)
  @ValidateOutput(RemovedWorkspaceMemberSchema)
  async invoke({ userId, email }: RemoveWorkspaceMemberData): Validated<RemovedWorkspaceMember> {
    if (!userId && !email) return fail(CustomErrorCode.memberReferenceRequired, ["userId"]);
    const path = [userId ? "userId" : "email"];
    const { companyId } = this;

    const removal = await runInTransaction(
      async () => {
        const member = await this.repo.findMemberCompanyWide(userId ? { id: userId } : { email: email ?? "" });
        if (!member || (userId && email && member.email !== email))
          return failNotFound(CustomErrorCode.userNotFound, path);

        const refusal = await memberRemovalRefusal(member, this.userId, { members: this.repo, roles: this.roleRepo });
        if (refusal) return refuse(refusal, path);

        if (!(await this.repo.leaveCompanyWide(member.id))) return refuse("left", path);
        try {
          await this.departure.announce(member);
        } catch (error) {
          return unwoundFailure(error);
        }
        return { ok: true as const, data: member };
      },
      { companyId },
    );
    if (!removal.ok) return removal;

    const member = removal.data;
    const loginId = await this.memberships.findLoginIdUnscoped(member.email);
    await this.departure.complete({
      companyId,
      member: { id: member.id, email: member.email, status: member.status },
      loginId,
    });
    if (loginId && member.status !== Status.pendingAuthorization) await this.notifyRemovedMember(member);

    return { ok: true as const, data: { userId: member.id, email: member.email, previousStatus: member.status } };
  }

  private async notifyRemovedMember(member: RemovableWorkspaceMember): Promise<void> {
    try {
      const locale = resolveUserLocale(member);
      const t = await getTranslator(locale);
      const { name } = await this.companyRepo.findCompanyOrThrow();
      const workspace = workspaceDisplayName(name, t("Workspaces.fallbackName"));
      const subject = t("WorkspaceRemovalNotice.subject", { workspace });

      await this.emailService.send({
        to: member.email,
        subject,
        react: createElement(WorkspaceRemovalNotice, {
          locale,
          layoutCopy: await getEmailLayoutCopy(locale),
          greeting: t("WorkspaceRemovalNotice.greeting", { firstName: member.firstName }),
          body: t("WorkspaceRemovalNotice.body", { workspace }),
          otherWorkspaces: t("WorkspaceRemovalNotice.otherWorkspaces"),
          cta: t("WorkspaceRemovalNotice.cta"),
          rejoin: t("WorkspaceRemovalNotice.rejoin", { workspace }),
          subject,
          title: t("WorkspaceRemovalNotice.title"),
        }),
      });
    } catch (error) {
      Sentry.captureException(error, { tags: { kind: "workspace-removal-email" } });
    }
  }
}
