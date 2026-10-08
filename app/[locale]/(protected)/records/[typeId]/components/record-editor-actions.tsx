"use client";

import { useMemo, type MouseEvent } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { Check, Maximize2, Settings2, Trash2 } from "lucide-react";
import type { RecordEditorStore } from "./record-editor.store";
import type { useRecordDeletion } from "./use-record-deletion";
import { AppModalActionRail, type AppModalActionProps } from "@/components/modal/app-modal-action";
import { useRecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { TopBarActionButtons } from "@/components/shared/top-bar-action-buttons";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import {
  RecordDetailLayoutStatus,
  useRecordDetailLayout,
  type RecordDetailLayoutState,
} from "./record-detail-personalization";

type Props = {
  store: RecordEditorStore;
  formId: string;
  name: string;
  deletion: ReturnType<typeof useRecordDeletion>;
};

type HeaderActionProps = Omit<Props, "formId"> & {
  layout: RecordDetailLayoutState | null;
  onOpenPage?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

function useRecordHeaderActions({ store, name, deletion, layout, onOpenPage }: HeaderActionProps) {
  const t = useTranslations();
  const record = store.record;
  const askAi = useRecordAiAction({
    registerContext: true,
    active: store.isOpen,
    context: {
      reference: record
        ? { kind: "record", typeId: record.ref.typeId, recordId: record.ref.recordId }
        : { kind: "recordType", typeId: store.presentation.typeId },
      label: name,
    },
  });
  const actions: AppModalActionProps[] = [
    ...(askAi ? [askAi] : []),
    ...(layout
      ? [
          {
            id: "customize",
            kind: "customize" as const,
            icon: layout.isPersonalizing ? Check : Settings2,
            label: layout.isPersonalizing ? t("EntityDetail.donePersonalizing") : t("EntityDetail.personalize"),
            pressed: layout.isPersonalizing,
            disabled: store.isTransactionBusy,
            onClick: () => layout.setIsPersonalizing(!layout.isPersonalizing),
          },
        ]
      : []),
    ...(record && store.presentation.permittedActions.includes("delete")
      ? [
          {
            id: "delete",
            icon: Trash2,
            label: t("Common.actions.delete"),
            variant: "destructive" as const,
            disabled: deletion.isPreviewing || store.isBusy,
            onClick: () => deletion.requestDeletion(record, store.presentation.model.revision, name),
          },
        ]
      : []),
    ...(record && onOpenPage
      ? [
          {
            id: "open-page",
            icon: Maximize2,
            label: t("RecordModel.openPage"),
            href: `/records/${record.ref.typeId}/${record.ref.recordId}`,
            onNavigate: onOpenPage,
          },
        ]
      : []),
  ];
  return actions;
}

export const RecordHeaderActions = observer(function RecordHeaderActions({
  className,
  ...props
}: HeaderActionProps & { className?: string }) {
  return <AppModalActionRail actions={useRecordHeaderActions(props)} className={className} />;
});

const RecordTopBarActions = observer(function RecordTopBarActions(props: HeaderActionProps) {
  return (
    <>
      <TopBarActionButtons actions={useRecordHeaderActions(props)} />

      {props.layout && <RecordDetailLayoutStatus {...props.layout} />}
    </>
  );
});

export const RecordEditorActions = observer(function RecordEditorActions({
  store,
  formId,
  compact = false,
}: Pick<Props, "store" | "formId"> & { compact?: boolean }) {
  return (
    <FormFooterActions
      dirty={store.record === null || store.hasUnsavedChanges}
      editable={!store.isReadOnly}
      formId={formId}
      placement={compact ? "topbar" : "card"}
      saving={store.isLoading || store.isDisabled}
      store={store}
    />
  );
});

export const RecordPageActions = observer(function RecordPageActions(props: Props) {
  const { store, formId, name, deletion } = props;
  const layout = useRecordDetailLayout();
  const actions = useMemo(
    () => (
      <div data-record-page-actions className="flex items-center gap-1">
        <RecordTopBarActions deletion={deletion} layout={layout} name={name} store={store} />

        <RecordEditorActions compact formId={formId} store={store} />
      </div>
    ),
    [deletion, formId, layout, name, store],
  );
  useSetTopBarActions(actions);
  return null;
});
