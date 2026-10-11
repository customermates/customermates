"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModalCloseContext } from "@/components/modal/app-modal-close-context";
import { runUserAction } from "@/core/errors/report-application-error";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  anchorScope?: string;
};

export const ViewChangesNotice = observer(function ViewChangesNotice<E extends HasId>({
  store,
  anchorScope,
}: Props<E>) {
  const t = useTranslations();
  if (!store.isViewModified) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1.5 text-xs text-muted-foreground"
      data-view-changes-notice=""
      role="status"
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />

      <span className="min-w-0 flex-1">{t("DataView.views.unsavedChangesNotice")}</span>

      <span className="flex shrink-0 items-center gap-1">
        <AppModalCloseContext.Provider value={null}>
          <FormFooterActions
            dirty
            editable
            anchorScope={anchorScope}
            placement="overlay"
            reset={{ differs: true, onReset: () => runUserAction(store.resetViewChanges) }}
            onSave={store.saveViewChanges}
          />
        </AppModalCloseContext.Provider>
      </span>
    </div>
  );
});
