"use client";

import { useCallback, useId, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordEditorStore } from "./record-editor.store";
import { recordColumns } from "@/features/records/record-columns";
import { EntityDetailFields } from "@/components/entity-detail/entity-detail-fields";
import { EntityDetailFieldShell } from "@/components/entity-detail/entity-detail-field-shell";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { RecordEditorField } from "./record-editor-fields";
import { RecordRelationshipEditor } from "./record-relationship-editor";
import { RecordPathRecords } from "./record-path-records";
import { RecordEmbeddedRecords } from "./record-embedded-records";
import { RecordCell } from "./record-cell";
import { getActiveUsersAction } from "@/app/[locale]/(protected)/settings/(workspace)/actions";
import { useEntityDetailPersonalization } from "@/components/entity-detail/entity-detail-personalization";
import type { EntityDetailPreviewItem } from "@/components/entity-detail/entity-detail-personalization";

export const RecordDetailOverview = observer(function RecordDetailOverview({
  store,
  renderEditor,
}: {
  store: RecordEditorStore;
  renderEditor: (child: RecordEditorStore) => ReactNode;
}) {
  const t = useTranslations();
  const assignedInputId = `assignedUserIds-${useId()}`;
  const { setPreviewFieldValue } = useEntityDetailPersonalization();
  const previewAssignees = useCallback(
    (items: EntityDetailPreviewItem[]) => setPreviewFieldValue("system:assignedTo", items),
    [setPreviewFieldValue],
  );
  const type = store.presentation.model.types.find((type) => type.id === store.presentation.typeId);
  const fields = recordColumns(store.presentation.typeId, store.presentation.model).flatMap((column) => {
    let content: ReactNode;
    if (column.kind === "field") {
      if (!store.record && column.field.behavior.kind !== "input" && column.field.behavior.kind !== "snapshot")
        return [];
      content = <RecordEditorField field={column.field} store={store} />;
    } else if (column.kind === "system") {
      const label = t(`RecordModel.${column.label}`);
      if (column.id === "system:assignedTo") {
        if (type?.embedded) return [];
        content = (
          <EntityDetailFieldShell
            fieldId={column.id}
            inputId={assignedInputId}
            label={label}
            locked={store.isPermissionReadOnly}
          >
            <FormAutocompleteAvatar
              ariaLabel={label}
              getItems={getActiveUsersAction}
              id="assignedUserIds"
              inputId={assignedInputId}
              items={
                store.record?.assignedUsers ?? (store.rootStore.userStore.user ? [store.rootStore.userStore.user] : [])
              }
              label={null}
              selectionMode="multiple"
              onSelectionDataChange={previewAssignees}
            />
          </EntityDetailFieldShell>
        );
      } else {
        if (!store.record) return [];
        content = (
          <EntityDetailFieldShell
            fieldId={column.id}
            label={label}
            value={
              <RecordCell
                column={column}
                linkColors={store.presentation.linkColors}
                linkIcons={store.presentation.linkIcons}
                linkLabels={store.presentation.linkLabels}
                record={store.record}
                onOpen={() => undefined}
              />
            }
          />
        );
      }
    } else if (column.kind === "relationshipPath") {
      if (!store.isOpen || !store.record) return [];
      content = <RecordPathRecords path={column.definition} store={store} targetTypeId={column.targetTypeId} />;
    } else {
      if (!store.isOpen || column.relation.id === store.parentLink?.relationId) return [];
      const child =
        column.direction === "incoming" &&
        store.presentation.model.types.find(
          (type) => type.embedded && type.parentRelationshipId === column.relation.id,
        );
      content = child ? (
        <RecordEmbeddedRecords renderEditor={renderEditor} store={store} type={child} />
      ) : (
        <RecordRelationshipEditor direction={column.direction} relationship={column.relation} store={store} />
      );
    }
    return [
      {
        id: column.id,
        label: column.kind === "system" ? t(`RecordModel.${column.label}`) : column.label,
        content,
      },
    ];
  });
  return <EntityDetailFields fields={fields} />;
});
