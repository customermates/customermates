"use client";

import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { XCustomFieldEditor } from "../x-custom-column/x-custom-field-editor";
import { useXDataView } from "../x-data-view-container";

import { bulkDeleteEntitiesAction, bulkUpdateCustomFieldValuesAction } from "@/app/actions";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XIcon } from "@/components/x-icon";
import { XSelect } from "@/components/x-inputs/x-select";
import { XSelectItem } from "@/components/x-inputs/x-select-item";

export const XMassActionsCard = observer(() => {
  const store = useXDataView();
  const t = useTranslations("MassActions");
  const [selectedColumnId, setSelectedColumnId] = useState<string>("");
  const [selectedValue, setSelectedValue] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const entityType = store.entityType;
  if (!entityType) return null;
  const targetEntityType = entityType;

  const selectedColumn = store.customColumns.find((col) => col.id === selectedColumnId);

  async function handleDelete() {
    const ids = Array.from(store.selectedIds);
    if (ids.length === 0) return;

    setIsLoading(true);
    await bulkDeleteEntitiesAction({ entityType: targetEntityType, ids });
    store.clearSelection();
    await store.refresh();
    setIsLoading(false);
  }

  async function handleUpdateFieldValue() {
    if (!selectedColumnId) return;
    const entityIds = Array.from(store.selectedIds);
    if (entityIds.length === 0) return;

    setIsLoading(true);
    await bulkUpdateCustomFieldValuesAction({
      entityType: targetEntityType,
      entityIds,
      customFieldValues: [{ columnId: selectedColumnId, value: selectedValue }],
    });
    store.clearSelection();
    await store.refresh();
    setIsLoading(false);
  }

  return (
    <div className="lg:sticky lg:top-0 lg:self-start flex flex-col gap-4 md:gap-6">
      <XCard>
        <XCardHeader>
          <div className="flex items-center justify-between w-full gap-2">
            <h2 className="text-x-md truncate">{t("selectedCount", { count: store.selectedCount })}</h2>

            <Button isIconOnly size="sm" variant="flat" onPress={() => store.clearSelection()}>
              <XIcon icon={XMarkIcon} />
            </Button>
          </div>
        </XCardHeader>

        <XCardBody>
          <div className="flex flex-col gap-4">
            <Button
              color="danger"
              isDisabled={isLoading}
              isLoading={isLoading}
              startContent={!isLoading && <XIcon icon={TrashIcon} />}
              variant="bordered"
              onPress={() => void handleDelete()}
            >
              {t("delete")}
            </Button>

            {store.customColumns.length > 0 && (
              <>
                <div className="border-t border-divider" />

                <p className="text-x-sm font-medium">{t("customFields")}</p>

                <XSelect
                  id="mass-actions-column-select"
                  items={store.customColumns}
                  label={t("selectField")}
                  selectedKeys={selectedColumnId ? [selectedColumnId] : []}
                  size="sm"
                  onSelectionChange={(keys) => {
                    const key = Array.from(keys)[0] as string;
                    setSelectedColumnId(key ?? "");
                    setSelectedValue(undefined);
                  }}
                >
                  {store.customColumns.map((col) =>
                    XSelectItem({
                      key: col.id,
                      children: col.label,
                    }),
                  )}
                </XSelect>

                {selectedColumn && (
                  <XCustomFieldEditor
                    column={selectedColumn}
                    label={t("selectValue")}
                    value={selectedValue}
                    onChange={setSelectedValue}
                  />
                )}

                {selectedColumn && (
                  <Button
                    color="primary"
                    isDisabled={isLoading}
                    isLoading={isLoading}
                    variant="solid"
                    onPress={() => void handleUpdateFieldValue()}
                  >
                    {t("updateValue")}
                  </Button>
                )}
              </>
            )}
          </div>
        </XCardBody>
      </XCard>
    </div>
  );
});
