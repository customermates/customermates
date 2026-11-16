import type { Redirect } from "@/features/auth/auth-outcome";
import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { TemplateBundle } from "@/core/templates/template-spec.schema";
import type { TemplateSlug } from "@/core/templates/template-slugs";
import type { EntitlementSubscriptionRepo } from "@/ee/subscription/entitlement-subscription.repo";
import type { OnboardingAgentStatusRepo } from "@/features/onboarding-funnel/onboarding-agent.repo";

import { z } from "zod";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { templateDeployment } from "@/core/templates/template-deployment";
import { signupUrl } from "@/core/templates/template-page-model";
import { renderTemplatePrompt } from "@/core/templates/template-prompt";
import { TEMPLATE_SLUGS } from "@/core/templates/template-slugs";
import { routineAllowanceOf } from "@/ee/subscription/entitlements";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";
import { mcpWorkspaceUrl } from "@/features/auth/mcp-resource";
import { env } from "@/env";
import { APP_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

import { offeredTemplateCards } from "./onboarding-template-offer";

const Schema = z.strictObject({
  slug: z.enum(TEMPLATE_SLUGS),
  locale: z.enum(APP_LOCALES),
});
export type GetOnboardingTemplatePromptData = z.infer<typeof Schema>;

export type OnboardingTemplatePrompt = { prompt: string | null; connected: boolean };

export type TemplateBundleLoader = (slug: TemplateSlug) => Promise<TemplateBundle | null>;

@SystemInteractor
export class GetOnboardingTemplatePromptInteractor {
  constructor(
    private readonly loadBundle: TemplateBundleLoader,
    private readonly routeGuardService: RouteGuardService,
    private readonly agentStatus: Pick<OnboardingAgentStatusRepo, "findOnboardingAgentStatus">,
    private readonly subscriptions: Pick<EntitlementSubscriptionRepo, "findSubscription">,
  ) {}

  @Validate(Schema)
  async invoke(
    data: GetOnboardingTemplatePromptData,
  ): Promise<Awaited<Validated<OnboardingTemplatePrompt>> | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    const user = resolution.user;
    if (!user) return redirectTo("/auth/signin");
    if (!user.role?.isSystemRole) return redirectTo("/");

    const mode = templateDeployment();
    const offered = offeredTemplateCards({ locale: data.locale, deployment: mode }).some(
      (card) => card.slug === data.slug,
    );
    const bundle = offered ? await this.loadBundle(data.slug) : null;
    const text = bundle?.text[data.locale] ?? bundle?.text[DEFAULT_LOCALE];
    if (!bundle || !text) return { ok: true as const, data: { prompt: null, connected: false } };

    const { connected, routineAllowance } = await runWithTenant(user, async () => {
      const [status, subscription] = await Promise.all([
        this.agentStatus.findOnboardingAgentStatus(),
        this.subscriptions.findSubscription(),
      ]);
      return { connected: status.connected, routineAllowance: subscription ? routineAllowanceOf(subscription) : null };
    });
    return {
      ok: true as const,
      data: {
        prompt: renderTemplatePrompt(bundle.spec, text, {
          deployment: mode,
          signupUrl: signupUrl(data.locale),
          connected,
          mcpUrl: mcpWorkspaceUrl(env.BASE_URL, user.companyId),
          routineAllowance,
        }),
        connected,
      },
    };
  }
}
