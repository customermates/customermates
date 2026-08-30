import type { RootStore } from "@/core/stores/root.store";
import type { HostedAiOperatorCompanyDto, OperatorUserDetailDto } from "@/ee/operator/operator.schema";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";
import type { OperatorActionState } from "../operator-form.store";

import { computed, makeObservable, toJS } from "mobx";
import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { OperatorFormStore } from "../operator-form.store";

import { correctOperatorSubscriptionSnapshotAction } from "../users/actions";
import { updateOperatorEnterpriseAllowanceAction } from "./actions";

export type OperatorWorkspaceFormContext = {
  getWorkspace: () => OperatorWorkspaceRowDto | null;
  getOwner: () => OperatorUserDetailDto | null;
  applyOwner: (owner: OperatorUserDetailDto) => void;
  refreshWorkspaces: () => void;
  refreshOwner: () => Promise<void>;
};

type SubscriptionFormState = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  quantity: number | undefined;
  reason: string;
};

export class OperatorWorkspaceSubscriptionFormStore extends OperatorFormStore<
  SubscriptionFormState,
  OperatorUserDetailDto
> {
  constructor(
    rootStore: RootStore,
    private readonly context: OperatorWorkspaceFormContext,
  ) {
    super(rootStore, {
      plan: SubscriptionPlan.pro,
      status: SubscriptionStatus.active,
      quantity: undefined,
      reason: "",
    });

    makeObservable(this, { isBlocked: computed });
  }

  get isBlocked(): boolean {
    const owner = this.context.getOwner();

    return !owner || !owner.subscription;
  }

  syncFromOwner(owner: OperatorUserDetailDto | null): void {
    this.onInitOrRefresh({
      plan: owner?.subscription?.plan ?? SubscriptionPlan.pro,
      status: owner?.subscription?.status ?? SubscriptionStatus.active,
      quantity: owner?.subscription?.quantity ?? undefined,
      reason: "",
    });
  }

  protected onConflict(): void {
    void this.context.refreshOwner();
  }

  protected async submit(operationId: string): Promise<OperatorActionState<OperatorUserDetailDto>> {
    const owner = this.context.getOwner();
    if (!owner?.subscription) return { status: "error", errorCode: "notFound" };

    return correctOperatorSubscriptionSnapshotAction({
      userId: owner.userId,
      expectedUpdatedAt: owner.subscription.updatedAt,
      plan: this.form.plan,
      status: this.form.status,
      quantity: toJS(this.form).quantity ?? null,
      reason: this.form.reason,
      operationId,
    });
  }

  protected onSuccess(owner: OperatorUserDetailDto): void {
    this.context.applyOwner(owner);
    this.context.refreshWorkspaces();
    this.toastSuccess("OperatorWorkspaces.subscription.success");
  }
}

type AllowanceFormState = { creditsPerUser: number | undefined; reason: string };

export class OperatorWorkspaceAllowanceFormStore extends OperatorFormStore<
  AllowanceFormState,
  HostedAiOperatorCompanyDto
> {
  constructor(
    rootStore: RootStore,
    private readonly context: OperatorWorkspaceFormContext,
  ) {
    super(rootStore, { creditsPerUser: undefined, reason: "" });

    makeObservable(this, { isBlocked: computed });
  }

  get isBlocked(): boolean {
    return !this.context.getWorkspace();
  }

  syncFromWorkspace(workspace: OperatorWorkspaceRowDto | null): void {
    this.onInitOrRefresh({
      creditsPerUser: workspace?.enterpriseCreditsPerUser ?? undefined,
      reason: "",
    });
  }

  protected async submit(operationId: string): Promise<OperatorActionState<HostedAiOperatorCompanyDto>> {
    const workspace = this.context.getWorkspace();
    if (!workspace) return { status: "error", errorCode: "notFound" };

    return updateOperatorEnterpriseAllowanceAction({
      companyId: workspace.id,
      creditsPerUser: toJS(this.form).creditsPerUser ?? 0,
      reason: this.form.reason,
      operationId,
    });
  }

  protected onSuccess(company: HostedAiOperatorCompanyDto): void {
    this.onInitOrRefresh({
      creditsPerUser: company.subscription.enterpriseCreditsPerUser ?? undefined,
      reason: "",
    });
    this.context.refreshWorkspaces();
    this.toastSuccess("OperatorWorkspaces.allowance.success");
  }
}
