"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { observer } from "mobx-react-lite";

import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { runUserAction } from "@/core/errors/report-application-error";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  anchorScope?: string;
};

export const ViewChangesNotice = observer(function ViewChangesNotice<E extends HasId>({
  store,
  anchorScope,
}: Props<E>) {
  if (!store.isViewModified) return null;

  return (
    <UnsavedChangesBar
      compact
      anchorScope={anchorScope}
      placement="sticky"
      onCancel={() => runUserAction(store.resetViewChanges)}
      onSave={store.saveViewChanges}
    />
  );
});
