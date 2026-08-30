import { redirect } from "next/navigation";

import { McpConsentCard } from "./mcp-consent-card";

import { getAuthService } from "@/core/di";
import { requireAccountState } from "@/features/auth/next/require";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { NOINDEX_METADATA } from "@/core/seo/noindex-metadata";

export const metadata = NOINDEX_METADATA;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function McpConsentPage({ searchParams }: Props) {
  await requireAccountState("allowed");

  const params = await searchParams;
  const consentCode = typeof params.consent_code === "string" ? params.consent_code : undefined;
  const clientId = typeof params.client_id === "string" ? params.client_id : undefined;

  if (!consentCode || !clientId) redirect("/");

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
      />
    </CenteredCardPage>
  );
}
