import type { Data, InteractorFailure, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { DeleteAccountForBillingService } from "@/ee/messaging/connect/delete-account-for-billing.service";
import type { DeleteAccountsForPlanConnectedAccountRepo } from "@/ee/messaging/connect/delete-accounts-for-plan-connected-account.repo";
import type { WorkspaceDeletionRepo } from "./workspace-deletion.repo";
import type { WorkspaceDeletionSubject } from "./workspace-deletion-refusal";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";
import type { UnrecordedSubscriptionCheck } from "@/ee/subscription/unrecorded-subscription-check";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { Status } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import {
  fail,
  failAuthorization,
  failConflict,
  failUnavailable,
  unwoundFailure,
} from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { logAuditEvent } from "@/core/utils/audit-log";
import { env } from "@/env";
import { nextLastUsedCompanyId } from "./next-last-used-workspace";
import { isWorkspaceDeleting } from "./workspace-deletion-marker";
import {
  WORKSPACE_DELETE_REFUSAL_CODES,
  workspaceBillingRefusal,
  workspaceDeleteRefusal,
} from "./workspace-deletion-refusal";

const Schema = z.object({ companyId: z.uuid() });
export type DeleteWorkspaceData = Data<typeof Schema>;

const OutputSchema = z.object({ companyId: z.string(), nextCompanyId: z.string().nullable() });
type DeleteWorkspaceResult = Data<typeof OutputSchema>;

type Login = { id: string; email: string };
type Admitted = { ok: true; data: WorkspaceDeletionSubject };

type ConnectedAccounts = Pick<DeleteAccountsForPlanConnectedAccountRepo, "listActiveAccountsForCompanyUnscoped">;
type ChannelRemoval = Pick<DeleteAccountForBillingService, "deleteForBillingOrThrow">;
type InboundEvents = { deleteCompanyInboundEventsUnscoped(companyId: string): Promise<void> };
type ProviderBilling = Pick<UnrecordedSubscriptionCheck, "findUnscoped">;

@TenantInteractor()
export class DeleteWorkspaceInteractor extends AuthenticatedInteractor<DeleteWorkspaceData, DeleteWorkspaceResult> {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: WorkspaceDeletionRepo,
    private readonly memberships: WorkspaceMembershipRepo,
    private readonly accounts: ConnectedAccounts,
    private readonly channelRemoval: ChannelRemoval,
    private readonly inboundEvents: InboundEvents,
    private readonly providerBilling: ProviderBilling,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: DeleteWorkspaceData): Validated<DeleteWorkspaceResult> {
    if (data.companyId !== this.companyId) return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);

    const session = await this.authService.getInteractiveSession();
    if (!session || session.user.email !== this.user.email) return failAuthorization(CustomErrorCode.permissionDenied);

    const { companyId } = this;
    const login = { id: session.user.id, email: session.user.email };

    const admitted = await this.admit(login);
    if (!admitted.ok) return admitted;

    const markedAt = new Date();
    const marked = await runInTransaction(
      async (): Validated<WorkspaceDeletionSubject> => {
        const current = await this.admit(login);
        if (!current.ok) return current;
        if (isWorkspaceDeleting(current.data.deletingAt, markedAt))
          return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);

        await this.repo.markDeletingUnscoped(companyId, markedAt);
        return current;
      },
      { companyId },
    ).catch(unwoundFailure);
    if (!marked.ok) return marked;

    let deleted: Awaited<ReturnType<DeleteWorkspaceInteractor["deleteMarked"]>> | undefined;
    try {
      deleted = await this.deleteMarked(login, marked.data, markedAt);
    } finally {
      if (!deleted?.ok) await this.repo.clearDeletingUnscoped(companyId, markedAt);
    }
    if (!deleted.ok) return deleted;

    await this.authService.setSessionActiveCompany(session.session.id, deleted.data.nextCompanyId);
    logAuditEvent("workspace-deleted", {
      companyId,
      appMode: env.APP_MODE,
      plan: marked.data.subscription?.plan ?? null,
      subscriptionStatus: marked.data.subscription?.status ?? null,
      memberCount: deleted.data.memberCount,
      workflowRunCount: deleted.data.workflowRunCount,
    });

    return { ok: true as const, data: { companyId, nextCompanyId: deleted.data.nextCompanyId } };
  }

  private async deleteMarked(
    login: Login,
    subject: WorkspaceDeletionSubject,
    markedAt: Date,
  ): Validated<DeleteWorkspaceResult & { memberCount: number; workflowRunCount: number }> {
    const { companyId } = this;
    const unrecorded = await this.refuseUnrecordedSubscription(subject);
    if (unrecorded) return unrecorded;

    try {
      await this.disconnectChannels();
    } catch (error) {
      Sentry.captureException(error, { tags: { kind: "workspace-delete-channel", companyId } });
      return failUnavailable(CustomErrorCode.workspaceDeleteChannelsFailed);
    }

    return runInTransaction(
      async (): Validated<DeleteWorkspaceResult & { memberCount: number; workflowRunCount: number }> => {
        const current = await this.repo.findDeletionSubjectUnscoped(companyId);
        if (!current || current.deletingAt?.getTime() !== markedAt.getTime())
          return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);
        if (current.strandsLastPlatformOperator) return fail(WORKSPACE_DELETE_REFUSAL_CODES.platformOperator);
        const billing = env.APP_MODE === "cloud" ? workspaceBillingRefusal(current.subscription) : null;
        if (billing) return fail(WORKSPACE_DELETE_REFUSAL_CODES[billing]);
        if ((await this.accounts.listActiveAccountsForCompanyUnscoped(companyId)).length > 0)
          return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);

        const members = await this.memberships.listCompanyMembersUnscoped(companyId);
        const creatorLoginId =
          current.createdByAuthUserId ??
          (current.earliestAdminEmail ? await this.memberships.findLoginIdUnscoped(current.earliestAdminEmail) : null);
        if (creatorLoginId) await this.memberships.markTrialConsumedUnscoped(creatorLoginId);

        await this.repo.deleteInviteTokensByCreatorsUnscoped(members.map((member) => member.id));
        await this.inboundEvents.deleteCompanyInboundEventsUnscoped(companyId);
        const workflowRunCount = await this.repo.deleteWorkflowRunsUnscoped(companyId);
        await this.repo.deleteCompanyUnscoped(companyId);

        let nextCompanyId: string | null = null;
        for (const member of members) {
          const loginId = await this.memberships.findLoginIdUnscoped(member.email);
          if (!loginId) continue;

          const remaining = await this.memberships.listWorkspaceMembershipsUnscoped(member.email);
          const next = nextLastUsedCompanyId(remaining, companyId);
          if (loginId === login.id) nextCompanyId = next;
          if ((await this.memberships.findAuthUserCompanyIdUnscoped(loginId)) === companyId)
            await this.memberships.setLastUsedCompanyUnscoped(loginId, next);
        }
        await this.memberships.detachAuthIdentitiesFromCompanyUnscoped(companyId);

        return {
          ok: true as const,
          data: { companyId, nextCompanyId, memberCount: members.length, workflowRunCount },
        };
      },
      { ...BULK_WRITE_TRANSACTION, companyId },
    ).catch(unwoundFailure);
  }

  private async admit(login: Login): Promise<Admitted | InteractorFailure> {
    const { companyId } = this;
    const member = await this.memberships.findMembershipUnscoped(login.email, companyId);
    const subject = await this.repo.findDeletionSubjectUnscoped(companyId);
    if (!subject || !member || member.status !== Status.active)
      return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);

    const refusal = workspaceDeleteRefusal({
      appMode: env.APP_MODE,
      login,
      isAdmin: member.role?.isSystemRole === true,
      subject,
    });
    if (refusal) return fail(WORKSPACE_DELETE_REFUSAL_CODES[refusal]);

    return { ok: true as const, data: subject };
  }

  private async refuseUnrecordedSubscription(subject: WorkspaceDeletionSubject): Promise<InteractorFailure | null> {
    const billing = subject.subscription;
    if (env.APP_MODE !== "cloud" || !billing?.checkoutStartedAt || billing.lemonSqueezyId) return null;

    const members = await this.memberships.listCompanyMembersUnscoped(this.companyId);
    const outcome = await this.providerBilling.findUnscoped(
      {
        companyId: this.companyId,
        name: subject.name,
        checkoutStartedAt: billing.checkoutStartedAt,
        checkoutEmail: billing.checkoutEmail,
      },
      members.map((member) => member.email),
    );
    if (outcome === "found") return fail(CustomErrorCode.workspaceDeleteBillingActive);
    if (outcome === "unverified") return failUnavailable(CustomErrorCode.workspaceDeleteBillingUnverified);
    return null;
  }

  private async disconnectChannels(): Promise<void> {
    for (const account of await this.accounts.listActiveAccountsForCompanyUnscoped(this.companyId))
      await this.channelRemoval.deleteForBillingOrThrow(account.id, "workspaceDeleted");
  }
}
