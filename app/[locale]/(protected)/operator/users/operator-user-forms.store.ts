import type { RootStore } from "@/core/stores/root.store";
import type { OperatorUserDetailDto, ResetOperatorUserCreditsResultDto } from "@/ee/operator/operator.schema";
import type { OperatorActionState } from "../operator-form.store";
import type { OperatorUserCreditAdjustmentResult } from "./actions";

import { computed, makeObservable, toJS } from "mobx";
import { Status } from "@/generated/prisma";

import { OperatorFormStore } from "../operator-form.store";

import {
  createOperatorUserCreditAdjustmentAction,
  resetOperatorUserCreditsAction,
  updateOperatorUserPlatformAccessAction,
  updateOperatorUserStatusAction,
} from "./actions";

export type OperatorUserFormContext = {
  getUser: () => OperatorUserDetailDto | null;
  applyUser: (user: OperatorUserDetailDto) => void;
  refreshDetail: () => Promise<void>;
};

abstract class OperatorUserFormStore<TForm extends object, TResult> extends OperatorFormStore<TForm, TResult> {
  constructor(
    rootStore: RootStore,
    initialState: TForm,
    protected readonly context: OperatorUserFormContext,
  ) {
    super(rootStore, initialState);
  }

  protected get user(): OperatorUserDetailDto | null {
    return this.context.getUser();
  }

  protected onConflict(): void {
    void this.context.refreshDetail();
  }

  abstract syncFromUser(user: OperatorUserDetailDto | null): void;
}

type StatusFormState = { status: Status; reason: string };

export class OperatorUserStatusFormStore extends OperatorUserFormStore<StatusFormState, OperatorUserDetailDto> {
  constructor(rootStore: RootStore, context: OperatorUserFormContext) {
    super(rootStore, { status: Status.active, reason: "" }, context);

    makeObservable(this, { isBlocked: computed });
  }

  get isBlocked(): boolean {
    return !this.user || !this.user.statusMutation.allowed;
  }

  syncFromUser(user: OperatorUserDetailDto | null): void {
    this.onInitOrRefresh({ status: user?.status ?? Status.active, reason: "" });
  }

  protected async submit(operationId: string): Promise<OperatorActionState<OperatorUserDetailDto>> {
    const user = this.user;
    if (!user) return { status: "error", errorCode: "notFound" };

    return updateOperatorUserStatusAction({
      userId: user.userId,
      expectedUpdatedAt: user.updatedAt,
      status: this.form.status,
      reason: this.form.reason,
      operationId,
    });
  }

  protected onSuccess(user: OperatorUserDetailDto): void {
    this.context.applyUser(user);
    this.toastSuccess("OperatorUsers.status.success");
  }
}

type PlatformAccessFormState = { isPlatformOperator: string; reason: string };

export class OperatorUserPlatformAccessFormStore extends OperatorUserFormStore<
  PlatformAccessFormState,
  OperatorUserDetailDto
> {
  constructor(rootStore: RootStore, context: OperatorUserFormContext) {
    super(rootStore, { isPlatformOperator: "false", reason: "" }, context);

    makeObservable(this, { isBlocked: computed });
  }

  get isBlocked(): boolean {
    return !this.user || this.user.isCurrentOperator;
  }

  syncFromUser(user: OperatorUserDetailDto | null): void {
    this.onInitOrRefresh({ isPlatformOperator: String(user?.isPlatformOperator ?? false), reason: "" });
  }

  protected async submit(operationId: string): Promise<OperatorActionState<OperatorUserDetailDto>> {
    const user = this.user;
    if (!user) return { status: "error", errorCode: "notFound" };

    return updateOperatorUserPlatformAccessAction({
      userId: user.userId,
      expectedUpdatedAt: user.updatedAt,
      isPlatformOperator: this.form.isPlatformOperator === "true",
      reason: this.form.reason,
      operationId,
    });
  }

  protected onSuccess(user: OperatorUserDetailDto): void {
    this.context.applyUser(user);
    this.toastSuccess("OperatorUsers.platformAccess.success");
  }
}

type CreditAdjustmentFormState = { creditDelta: number | undefined; reason: string };

export class OperatorUserCreditAdjustmentFormStore extends OperatorUserFormStore<
  CreditAdjustmentFormState,
  OperatorUserCreditAdjustmentResult
> {
  constructor(rootStore: RootStore, context: OperatorUserFormContext) {
    super(rootStore, { creditDelta: undefined, reason: "" }, context);

    makeObservable(this, { isBlocked: computed });
  }

  get isBlocked(): boolean {
    const user = this.user;
    if (!user || user.status !== Status.active) return true;

    return !user.creditPeriod || Boolean(user.creditPeriod.blockedReason);
  }

  syncFromUser(_user: OperatorUserDetailDto | null): void {
    this.onInitOrRefresh({ creditDelta: undefined, reason: "" });
  }

  protected async submit(operationId: string): Promise<OperatorActionState<OperatorUserCreditAdjustmentResult>> {
    const user = this.user;
    const period = user?.creditPeriod;
    if (!user || !period) return { status: "error", errorCode: "notFound" };

    return createOperatorUserCreditAdjustmentAction({
      companyId: user.companyId,
      userId: user.userId,
      creditDelta: toJS(this.form).creditDelta ?? 0,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      reason: this.form.reason,
      operationId,
    });
  }

  protected onSuccess(result: OperatorUserCreditAdjustmentResult): void {
    this.context.applyUser(result.user);
    this.toastSuccess("OperatorUsers.adjustment.success");
  }
}

type CreditResetFormState = { mode: "baseAllowance" | "zeroBalance"; reason: string };

export class OperatorUserCreditResetFormStore extends OperatorUserFormStore<
  CreditResetFormState,
  ResetOperatorUserCreditsResultDto
> {
  constructor(rootStore: RootStore, context: OperatorUserFormContext) {
    super(rootStore, { mode: "baseAllowance", reason: "" }, context);

    makeObservable(this, { isBlocked: computed });
  }

  get isBlocked(): boolean {
    const user = this.user;

    return !user || user.status !== Status.active || !user.creditPeriod;
  }

  syncFromUser(_user: OperatorUserDetailDto | null): void {
    this.onInitOrRefresh({ mode: "baseAllowance", reason: "" });
  }

  protected async submit(operationId: string): Promise<OperatorActionState<ResetOperatorUserCreditsResultDto>> {
    const user = this.user;
    const period = user?.creditPeriod;
    if (!user || !period) return { status: "error", errorCode: "notFound" };

    return resetOperatorUserCreditsAction({
      userId: user.userId,
      mode: this.form.mode,
      expectedPeriodStart: period.periodStart,
      expectedPeriodEnd: period.periodEnd,
      expectedBaseAllowanceCredits: period.baseAllowanceCredits,
      expectedAdjustmentCredits: period.adjustmentCredits,
      expectedCommittedCredits: period.committedCredits,
      reason: this.form.reason,
      operationId,
    });
  }

  protected onSuccess(result: ResetOperatorUserCreditsResultDto): void {
    this.context.applyUser(result.user);
    this.toastSuccess("OperatorUsers.reset.success");
  }
}
