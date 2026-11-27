import { setRequestLocale } from "next-intl/server";

import { ConnectAgentCard } from "./connect-agent-card";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { agentStartUrl } from "@/core/agent-start/agent-start-guide";
import { getListMyWorkspacesInteractor } from "@/core/di";
import { NOINDEX_METADATA } from "@/core/seo/noindex-metadata";
import { env } from "@/env";
import { buildLocalePath } from "@/i18n/locale-registry";
import { MCP_ENDPOINT_PATH } from "@/features/auth/mcp-resource";
import { requireAccess } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";

export const metadata = NOINDEX_METADATA;

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ConnectAgentPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAccess();

  const [{ sessionUser }, { data: workspaces }] = await Promise.all([
    resolveRequestAccountState(),
    getListMyWorkspacesInteractor().invoke(),
  ]);
  const baseUrl = env.BASE_URL.replace(/\/+$/u, "");

  return (
    <CenteredCardPage>
      <ConnectAgentCard
        appHref={buildLocalePath(locale, "/dashboard")}
        email={sessionUser?.email ?? ""}
        guideUrl={agentStartUrl(baseUrl)}
        mcpUrl={`${baseUrl}${MCP_ENDPOINT_PATH}`}
        workspaceCount={workspaces.length}
      />
    </CenteredCardPage>
  );
}
