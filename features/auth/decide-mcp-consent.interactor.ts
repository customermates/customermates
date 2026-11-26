import type { Data, Validated } from "@/core/validation/validation.utils";
import type { WorkspaceMembershipRepo } from "@/features/workspace/workspace-membership.repo";
import type { AuthService } from "./auth.service";
import type { ListMcpConsentWorkspacesInteractor } from "./list-mcp-consent-workspaces.interactor";
import type { RouteGuardService } from "./route-guard.service";

import { z } from "zod";

import { currentLegalDocumentVersions } from "@/constants/legal-documents";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { canConnectMcp, isMcpConsentMemberState } from "./mcp-access";

const Schema = z.object({
  consentCode: z.string().min(1),
  accept: z.boolean(),
  acceptTerms: z.boolean().optional(),
});
export type DecideMcpConsentData = Data<typeof Schema>;

const OutputSchema = z.object({ redirectURI: z.url() }).nullable();
type DecideMcpConsentResult = Data<typeof OutputSchema>;

@AllowInDemoMode
@SystemInteractor
export class DecideMcpConsentInteractor {
  constructor(
    private authService: AuthService,
    private routeGuardService: RouteGuardService,
    private consentAccount: Pick<ListMcpConsentWorkspacesInteractor, "invoke">,
    private legal: Pick<WorkspaceMembershipRepo, "recordAccountLegalVersionsUnscoped">,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: DecideMcpConsentData): Promise<Awaited<Validated<DecideMcpConsentResult>>> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (!resolution.sessionUser || !isMcpConsentMemberState(resolution.state)) return { ok: true, data: null };

    const resourceCompanyId = await this.authService.getMcpConsentWorkspace(data.consentCode);
    if (resourceCompanyId) return this.decideForResourceWorkspace(data, resourceCompanyId);

    const { workspaces, termsOffered, termsRequired } = (await this.consentAccount.invoke()).data;
    const usable = workspaces.filter((workspace) => workspace.unavailableReason === null);
    const accept = data.accept && (usable.length > 0 || workspaces.length === 0);
    if (accept && termsRequired && data.acceptTerms !== true)
      return fail(CustomErrorCode.termsNotAgreed, ["acceptTerms"]);
    if (accept && termsOffered && data.acceptTerms === true)
      await this.legal.recordAccountLegalVersionsUnscoped(resolution.sessionUser.id, currentLegalDocumentVersions());

    return {
      ok: true,
      data: await this.authService.decideMcpConsent({
        consentCode: data.consentCode,
        accept,
        companyId: usable.length === 1 ? usable[0].companyId : null,
        accountWide: true,
      }),
    };
  }

  private async decideForResourceWorkspace(
    data: DecideMcpConsentData,
    companyId: string,
  ): Promise<Awaited<Validated<DecideMcpConsentResult>>> {
    const target = data.accept ? await this.routeGuardService.resolveMembershipForConsent(companyId) : null;
    const accept = target !== null && canConnectMcp(target.role);
    return {
      ok: true,
      data: await this.authService.decideMcpConsent({
        consentCode: data.consentCode,
        accept,
        companyId: accept ? companyId : null,
        accountWide: false,
      }),
    };
  }
}
