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
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModal, AppModalTitle } from "@/components/modal";
import { usePreviewBlockers } from "./use-preview-blockers";

type SheetStore = BaseModalStore & {
  preview: ConfigurationPreview | null;
  model: RecordModelView;
  isReadOnly: boolean;
  previewReady: boolean;
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
      titleInContent
      actions={actions}
      bodyClassName="flex flex-col overflow-hidden px-0"
      side="right"
      store={store}
      title={title}
    >
      <AppCard>
        <AppCardHeader>
          <AppModalTitle className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</AppModalTitle>
        </AppCardHeader>

        <AppCardBody>{children}</AppCardBody>

        <FormFooterActions
          dirty={creating || store.hasUnsavedChanges || store.previewReady}
          editable={!store.isReadOnly}
          saving={store.isLoading}
          onSave={store.onSubmit}
        />
      </AppCard>
    </AppModal>
  );
});
