import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { ConfirmWorkspaceSetupData } from "./workspace-setup-input.schema";
import type { GetCompanyRepo } from "@/features/company/get-company.repo";
import type { RenameWorkspaceInteractor } from "@/features/workspace/rename-workspace.interactor";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";

import * as ErrorReporter from "@/core/observability/server";
import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { WorkspaceNameSchema } from "@/features/workspace/workspace.schema";

import { WORKSPACE_SETUP_PHASES } from "./workspace-setup.schema";
import { ConfirmWorkspaceSetupSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";
import { emptySetupPhase } from "./workspace-setup-phases";
import { setupLanguage } from "./workspace-setup-inputs";

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class ConfirmWorkspaceSetupInteractor extends AuthenticatedInteractor<
  ConfirmWorkspaceSetupData,
  { setupId: string }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private background: Pick<BackgroundTaskService, "dispatch">,
    private companyRepo: GetCompanyRepo,
    private rename: Pick<RenameWorkspaceInteractor, "invoke">,
    private entitlements: Pick<EntitlementService, "require">,
  ) {
    super();
  }

  @Write({ input: ConfirmWorkspaceSetupSchema, tx: false })
  async invoke(data: ConfirmWorkspaceSetupData): Validated<{ setupId: string }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;
    const confirmed = await this.repo.mutate(data.setupId, (setup) => {
      if (setup.status !== "planned" || !setup.plan || setup.planRevision !== data.planRevision) return null;
      return {
        status: "building",
        confirmedAt: new Date(),
        phases: Object.fromEntries(WORKSPACE_SETUP_PHASES.map((phase) => [phase, emptySetupPhase()])),
      };
    });
    if (!confirmed) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    if (!confirmed.changed) {
      if (confirmed.setup.status === "building" && confirmed.setup.planRevision === data.planRevision)
        return { ok: true, data: { setupId: data.setupId } };
      return failConflict(CustomErrorCode.workspaceSetupConflict);
    }

    try {
      const { crawlId, answers } = confirmed.setup;
      if (crawlId) {
        const reopened = await this.repo.reopenCrawlSynthesis(crawlId);
        await this.repo.setCrawlLocale(crawlId, setupLanguage(answers));
        if (reopened) await this.background.dispatch("crawl-wiki-website", { crawlId, userId: this.userId });
      }
      await this.background.dispatch("build-workspace-setup", { setupId: data.setupId, userId: this.userId });
    } catch (error) {
      await this.repo.mutate(data.setupId, (setup) => {
        const untouched = WORKSPACE_SETUP_PHASES.every((phase) => (setup.phases[phase]?.attempts ?? 0) === 0);
        return setup.status === "building" && untouched ? { status: "planned", confirmedAt: null } : null;
      });
      throw error;
    }
    await this.nameUnnamedWorkspace(confirmed.setup.answers).catch((error: unknown) =>
      ErrorReporter.captureException(error, { tags: { kind: "workspace-setup-name" } }),
    );
    return { ok: true, data: { setupId: data.setupId } };
  }

  private async nameUnnamedWorkspace(answers: SetupAnswers) {
    const answer = answers.companyName?.value;
    const name = WorkspaceNameSchema.safeParse(answer?.format === "shortText" ? answer.value : "");
    if (!name.success || (await this.companyRepo.findCompanyOrThrow()).name?.trim()) return;
    await this.rename.invoke({ name: name.data });
  }
}
