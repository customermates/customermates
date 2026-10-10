import type { ConfigureGraphAccounts } from "./components/configure-graph";

import {
  getGetRecordModelInteractor,
  getDiscoverRecordTypesInteractor,
  getGetMessagingAccountsStateInteractor,
  getGetP13nInteractor,
} from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { PageContainer } from "@/components/shared/page-container";
import { CONFIGURE_GRAPH_P13N_ID, readP13nSettings } from "@/features/p13n/p13n-settings.schema";
import { ConfigurePageView } from "./components/configure-page-view";

async function loadAccounts(): Promise<ConfigureGraphAccounts> {
  const messaging = await unwrapValidated(getGetMessagingAccountsStateInteractor().invoke());
  if (messaging.state !== "available") return { state: messaging.state };
  return {
    state: "available",
    accounts: messaging.accounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      status: account.status,
      address: account.emailAddress ?? account.displayName,
      hasMessaging: account.hasMessaging,
      hasCalendar: account.hasCalendar,
      linkedinProducts: account.linkedinProducts,
    })),
  };
}

async function loadSavedLayout() {
  const entry = await getGetP13nInteractor().invoke({ p13nId: CONFIGURE_GRAPH_P13N_ID });
  return readP13nSettings(CONFIGURE_GRAPH_P13N_ID, entry.data?.settings);
}

export default async function ConfigurePage() {
  await requireAccess();
  const [model, catalog, accounts, savedLayout] = await Promise.all([
    unwrapValidated(getGetRecordModelInteractor().invoke({})),
    unwrapValidated(
      getDiscoverRecordTypesInteractor().invoke({
        page: 1,
        pageSize: 100,
        includeEmbedded: true,
      }),
    ),
    loadAccounts(),
    loadSavedLayout(),
  ]);
  return (
    <PageContainer padded={false}>
      <ConfigurePageView
        accounts={accounts}
        canAddSublist={catalog.canManageSchema && (catalog.canManageRoles ?? false)}
        canManage={catalog.canManageSchema}
        canPublishSummary={catalog.canPublishSummary ?? false}
        catalog={catalog.types}
        initialModel={model}
        savedLayout={savedLayout}
      />
    </PageContainer>
  );
}
