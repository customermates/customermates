import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { Validated } from "@/core/validation/validation.utils";
import type { CompleteOnboardingSetupStepRepo } from "@/features/onboarding-wizard/complete-onboarding-setup-step.repo";
import type { CompleteOnboardingWizardRepo } from "@/features/onboarding-wizard/complete-onboarding-wizard.interactor";
import type { CreateWikiPagesInteractor } from "@/features/wiki/create-wiki-pages.interactor";
import type { OnboardingPlaybook } from "./onboarding-playbook";

import { z } from "zod";

import { settingsHref } from "@/app/components/navigation/settings-routes";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { withWorkspaceHref } from "@/core/navigation/workspace-paths";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { ONBOARDING_ORIGIN_QUERY_PARAM, ONBOARDING_ORIGIN_VALUE } from "./onboarding-job";
import { OnboardingPlaybookSchema } from "./onboarding-playbook";
import { onboardingPlaybookPages } from "./onboarding-playbook-pages";

const Schema = z.strictObject({ playbook: OnboardingPlaybookSchema.nullable(), locale: z.enum(APP_LOCALES) });
export type ApplyOnboardingPlaybookData = z.infer<typeof Schema>;

export type ApplyOnboardingPlaybookResult = {
  playbook: OnboardingPlaybook | null;
  pagesWritten: number;
  redirectTo: string;
};

export function onboardingChannelsHref(slug: string | undefined): string {
  const query = new URLSearchParams([[ONBOARDING_ORIGIN_QUERY_PARAM, ONBOARDING_ORIGIN_VALUE]]);
  return withWorkspaceHref(`${settingsHref("channels")}?${query.toString()}`, slug);
}

@SystemInteractor
export class ApplyOnboardingPlaybookInteractor {
  constructor(
    private createPages: Pick<CreateWikiPagesInteractor, "invoke">,
    private setupStep: CompleteOnboardingSetupStepRepo,
    private wizard: CompleteOnboardingWizardRepo,
    private routeGuardService: RouteGuardService,
  ) {}

  @Validate(Schema)
  async invoke(
    data: ApplyOnboardingPlaybookData,
  ): Promise<Awaited<Validated<ApplyOnboardingPlaybookResult>> | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    const user = resolution.user;
    if (!user) return redirectTo("/auth/signin");
    if (!user.role?.isSystemRole) return redirectTo("/");

    return runWithTenant(user, async () => {
      const written = data.playbook
        ? await this.writePages(data.playbook, data.locale)
        : { ok: true as const, count: 0 };
      if (!written.ok) return written.failure;

      await this.setupStep.markOnboardingSetupStepCompleted({ userId: user.id });
      await this.wizard.markOnboardingWizardCompleted({ userId: user.id });
      return {
        ok: true as const,
        data: {
          playbook: data.playbook,
          pagesWritten: written.count,
          redirectTo: onboardingChannelsHref(user.company?.slug),
        },
      };
    });
  }

  private async writePages(playbook: OnboardingPlaybook, locale: ApplyOnboardingPlaybookData["locale"]) {
    const { pages, guide } = await onboardingPlaybookPages(locale, playbook);
    const created = await this.createPages.invoke({ pages, requireEmpty: true });
    if (!created.ok) {
      if (interactorFailureCodes(created.error).includes(CustomErrorCode.wikiNotEmpty))
        return { ok: true as const, count: 0 };
      return { ok: false as const, failure: created };
    }
    const linked = await this.createPages.invoke({
      pages: [guide(created.data.map(({ id, title }) => ({ id, title })))],
      requireEmpty: false,
    });
    return { ok: true as const, count: created.data.length + (linked.ok ? linked.data.length : 0) };
  }
}
