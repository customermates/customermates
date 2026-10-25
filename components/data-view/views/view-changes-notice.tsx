"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { runUserAction } from "@/core/errors/report-application-error";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  anchorScope?: string;
  onSaveAsView?: () => void;
};

export function useViewSaveAction<E extends HasId>(
  store: BaseDataViewStore<E>,
  onSaveAsView: (() => void) | undefined,
): { onSave: () => void | Promise<void>; saveLabel?: string } {
  const t = useTranslations();
  if (store.canSaveViewChanges || !store.canSaveAsView) return { onSave: store.saveViewChanges };

  return { onSave: onSaveAsView ?? store.openSaveAsView, saveLabel: t("DataView.views.saveAsView") };
}

export const ViewChangesNotice = observer(function ViewChangesNotice<E extends HasId>({
  store,
  anchorScope,
  onSaveAsView,
}: Props<E>) {
  const save = useViewSaveAction(store, onSaveAsView);
  if (!store.isViewModified) return null;

  return (
    <UnsavedChangesBar
      compact
      anchorScope={anchorScope}
      placement="sticky"
      saveLabel={save.saveLabel}
      onCancel={() => runUserAction(store.resetViewChanges)}
      onSave={save.onSave}
    />
  );
});
