import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { StartWorkspaceSetupData } from "./workspace-setup-input.schema";
import type { GetCompanyRepo } from "@/features/company/get-company.repo";
import type { OnboardingFunnelRepo } from "@/features/onboarding-funnel/onboarding-funnel.repo";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { appLocaleOrDefault, countryCodeFor, localeDefaultCurrency } from "@/i18n/locale-registry";

import { StartWorkspaceSetupSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";
import { setupTeamSize } from "./workspace-setup-inputs";

const REUSABLE = new Set(["interview", "planning", "planned"]);

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class StartWorkspaceSetupInteractor extends AuthenticatedInteractor<
  StartWorkspaceSetupData,
  { setupId: string }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private companyRepo: GetCompanyRepo,
    private funnel: Pick<OnboardingFunnelRepo, "findOnboardingJobChoice">,
    private entitlements: Pick<EntitlementService, "require">,
  ) {
    super();
  }

  @Write({ input: StartWorkspaceSetupSchema, tx: false })
  async invoke(data: StartWorkspaceSetupData): Validated<{ setupId: string }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const templateSlug = data.templateSlug ?? null;
    const existing = await this.repo.findCurrent();
    if (existing && REUSABLE.has(existing.status) && existing.interview.templateSlug === templateSlug)
      return { ok: true, data: { setupId: existing.id } };
    if (existing && existing.status !== "failed" && existing.status !== "interview")
      return failConflict(CustomErrorCode.workspaceSetupConflict);

    const answers = await this.profileAnswers(data);
    let setupId: string;
    if (existing) {
      if (!(await this.repo.restart(existing.id, { answers, templateSlug })))
        return failConflict(CustomErrorCode.workspaceSetupConflict);
      setupId = existing.id;
    } else {
      const created = await this.repo.create({ answers, templateSlug });
      if (!created) return failConflict(CustomErrorCode.workspaceSetupConflict);
      setupId = created.id;
    }

    return { ok: true, data: { setupId } };
  }

  private async profileAnswers(data: StartWorkspaceSetupData): Promise<SetupAnswers> {
    const locale = appLocaleOrDefault(data.locale);
    const choice = (value: string) => ({
      source: "user" as const,
      confidence: 1,
      value: { format: "singleChoice" as const, value },
    });
    const name = (await this.companyRepo.findCompanyOrThrow()).name?.trim();
    const teamSize = setupTeamSize((await this.funnel.findOnboardingJobChoice()).teamSize);
    return {
      language: choice(locale),
      currency: choice(localeDefaultCurrency(locale)),
      country: choice(countryCodeFor(locale)),
      ...(teamSize ? { teamSize: choice(teamSize) } : {}),
      ...(name ? { companyName: { source: "user", confidence: 1, value: { format: "shortText", value: name } } } : {}),
    };
  }
}
