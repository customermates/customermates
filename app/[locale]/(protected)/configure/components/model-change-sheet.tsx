"use client";

import type { ReactNode } from "react";
import type { BaseModalStore } from "@/core/base/base-modal.store";
import type { ConfigurationPreview } from "@/features/records/configuration.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { AppModalActionProps } from "@/components/modal/app-modal-action";

import { observer } from "mobx-react-lite";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { AppModal, AppModalTitle } from "@/components/modal";
import { usePreviewBlockers } from "./use-preview-blockers";

type SheetStore = BaseModalStore & {
  preview: ConfigurationPreview | null;
  model: RecordModelView;
  isReadOnly: boolean;
  previewReady: boolean;
  setPreview: (preview: ConfigurationPreview | null) => void;
  onSubmit: () => Promise<void>;
};

export const ModelChangeSheet = observer(function ModelChangeSheet({
  store,
  title,
  creating = false,
  actions = [],
  children,
}: {
  store: SheetStore;
  title: string;
  creating?: boolean;
  actions?: readonly AppModalActionProps[];
  children: ReactNode;
}) {
  usePreviewBlockers(store.isOpen ? store.preview : null, store.model);
  return (
    <AppModal
      sheet
      titleInContent
      actions={actions}
      bodyClassName="flex flex-col overflow-hidden px-0"
      store={store}
      title={title}
    >
      <AppCard className="relative">
        <AppCardHeader>
          <AppModalTitle className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</AppModalTitle>
        </AppCardHeader>

        <AppCardBody className="pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]">
          {children}
        </AppCardBody>

        <UnsavedChangesBar
          creating={creating}
          dirty={store.hasUnsavedChanges || store.previewReady}
          store={store}
          onCancel={
            creating
              ? undefined
              : () => {
                  store.resetForm();
                  store.setPreview(null);
                }
          }
          onSave={store.onSubmit}
        />
      </AppCard>
    </AppModal>
  );
});
