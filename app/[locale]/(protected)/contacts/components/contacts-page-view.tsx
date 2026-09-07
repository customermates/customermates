"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ContactDto } from "@/features/contacts/contact.schema";

import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { useExportAction } from "@/features/data-transfer/export/use-export-download";
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { ContactsPageSkeleton } from "./contacts-page-skeleton";
import { useContactColumns } from "./use-contact-columns";

type Props = {
  contacts: GetResult<ContactDto>;
};

export const ContactsPageView = observer(function ContactsPageView({ contacts }: Props) {
  const { contactsStore, dealsStore, importWizardStore, organizationsStore } = useRootStore();

  useDataViewSync(contactsStore, contacts, [dealsStore, organizationsStore]);
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const columns = useContactColumns();
  const { singular } = useEntityTerminology();
  const t = useTranslations();

  const view = resolveDataViewView(contactsStore.viewMode, contactsStore.canBoard);
  const hasActiveQuery = Boolean(contactsStore.searchTerm?.trim()) || (contactsStore.filters?.length ?? 0) > 0;
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery,
    isGrouped: contactsStore.isGrouped,
    itemCount: contactsStore.items.length,
    request: contactsStore.dataRequest,
    total: contactsStore.pagination?.total,
  });
  const emptyActionLabel = t("Common.emptyState.cta", {
    singular: singular(EntityType.contact),
  });
  const handleAdd = useCallback(() => openEntity(EntityType.contact, "new"), [openEntity]);
  const rowHref = useCallback((contact: ContactDto) => entityHref(EntityType.contact, contact.id), [entityHref]);
  const handleExport = useExportAction(contactsStore);
  const handleImport = useCallback(
    () => importWizardStore.openForEntity(EntityType.contact, () => contactsStore.refresh()),
    [importWizardStore, contactsStore],
  );
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? emptyActionLabel : undefined}
        anchorScope="contacts"
        store={contactsStore}
        onAdd={handleAdd}
        onExport={handleExport}
        onImport={handleImport}
      />
    ),
    [contactsStore, emptyActionLabel, handleAdd, handleExport, handleImport, pageState],
  );

  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => contactsStore.setQueryOptions({ forceRefresh: true })}>
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "loading":
      body = (
        <PageState background={<ContactsPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty reason="filtered" store={contactsStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={emptyActionLabel}
          background={<ContactsPageSkeleton animated={false} view={view} />}
          reason="true-empty"
          store={contactsStore}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = <DataViewContent columns={columns} rowHref={rowHref} store={contactsStore} view={view} />;
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout
      showPagination={pageState === "content" && view !== "board" && !contactsStore.isGrouped}
      store={contactsStore}
    >
      {body}
    </DataViewLayout>
  );
});
