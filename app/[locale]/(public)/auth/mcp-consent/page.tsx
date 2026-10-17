import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { McpConsentCard } from "./mcp-consent-card";

import { getAuthService, getListMcpConsentWorkspacesInteractor, getRouteGuardService } from "@/core/di";
import { requireAccountState } from "@/features/auth/next/require";
import { accountStateRedirect } from "@/features/auth/account-state";
import { MCP_CONSENT_MEMBER_STATES } from "@/features/auth/mcp-access";
import { buildLocalePath } from "@/i18n/locale-registry";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { NOINDEX_METADATA } from "@/core/seo/noindex-metadata";

export const metadata = NOINDEX_METADATA;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function McpConsentPage({ searchParams }: Props) {
  const resolution = await requireAccountState(MCP_CONSENT_MEMBER_STATES);
  const consentState = await getRouteGuardService().resolveMcpConsentState(resolution);
  const currentCanConsent =
    consentState === resolution.state && (consentState === "allowed" || consentState === "onboarding");

  const params = await searchParams;
  const consentCode = typeof params.consent_code === "string" ? params.consent_code : undefined;
  const clientId = typeof params.client_id === "string" ? params.client_id : undefined;

  if (!consentCode || !clientId) redirect("/");

  const { data: workspaces } = await getListMcpConsentWorkspacesInteractor().invoke();
  if (!currentCanConsent && !workspaces.some((workspace) => workspace.unavailableReason === null))
    redirect(buildLocalePath(await getLocale(), accountStateRedirect(resolution.state) ?? "/"));

  const prompt = await getAuthService().getMcpConsentPrompt({
    consentCode,
    clientId,
  });
  if (!prompt) redirect("/");

  return (
    <CenteredCardPage>
      <McpConsentCard
        clientName={prompt.clientName}
        consentCode={consentCode}
        redirectHost={prompt.redirectHost}
        scopes={prompt.scopes}
        workspaces={workspaces}
      />
    </CenteredCardPage>
  );
}
