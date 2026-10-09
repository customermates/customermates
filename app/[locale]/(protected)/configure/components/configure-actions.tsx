"use client";

import type { ReactNode } from "react";
import type { RecordModelView, RecordType } from "@/features/records/record-model.schema";
import type { TypeModalStore } from "./type-modal";

import { observer } from "mobx-react-lite";
import { History, LayoutList, List, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { runUserAction } from "@/core/errors/report-application-error";
import { TopBarMenuButton, TopBarPrimaryButton } from "@/components/shared/top-bar-action-buttons";
import { IntlLink } from "@/i18n/navigation";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

import { recordChannelsField } from "@/features/records/record-channels";
import { useConfigurationDeletion } from "./use-configuration-deletion";
import { ConfigureListAddItems, type ConfigureListAddKind } from "./configure-add-menu";

export type ConfigureAddKind = "list" | ConfigureListAddKind;

type Props = {
  ai: ReactNode;
  canManage: boolean;
  disabled: boolean;
  general: TypeModalStore;
  generalFormId: string;
  selected?: RecordType;
  canAddSublist: boolean;
  onAdd: (kind: ConfigureAddKind) => void;
  onSharedDefaults: () => void;
  model: RecordModelView;
  onDeleted: () => Promise<void>;
};

export const ConfigureTopBarActions = observer(function ConfigureTopBarActions({
  ai,
  canManage,
  disabled,
  general,
  generalFormId,
  selected,
  canAddSublist,
  onAdd,
  onSharedDefaults,
  model,
  onDeleted,
}: Props) {
  const t = useTranslations();
  const deletion = useConfigurationDeletion(onDeleted);
  if (!canManage) return <div className="flex shrink-0 items-center gap-1">{ai}</div>;
  if (selected && general.original?.id === selected.id && general.hasUnsavedChanges)
    return <FormFooterActions formId={generalFormId} placement="topbar" store={general} />;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {ai}

      {!selected && (
        <TopBarMenuButton
          disabled={disabled}
          icon={MoreHorizontal}
          label={t("RecordModel.configurationDeletion.configureActions")}
        >
          <DropdownMenuItem asChild>
            <IntlLink href="/configure/deleted">
              <History aria-hidden="true" />

              {t("RecordModel.configurationDeletion.recentlyDeleted")}
            </IntlLink>
          </DropdownMenuItem>
        </TopBarMenuButton>
      )}

      {selected && (
        <TopBarMenuButton disabled={disabled} icon={MoreHorizontal} label={t("RecordModel.listActions")}>
          <DropdownMenuItem onSelect={onSharedDefaults}>
            <LayoutList aria-hidden="true" />

            {t("RecordModel.sharedDefaults")}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <IntlLink href="/configure/deleted">
              <History aria-hidden="true" />

              {t("RecordModel.configurationDeletion.recentlyDeleted")}
            </IntlLink>
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={deletion.isBusy}
            variant="destructive"
            onSelect={() =>
              runUserAction(() =>
                deletion.requestDelete(model, { kind: "type", id: selected.id }, selected.pluralLabel),
              )
            }
          >
            <Trash2 aria-hidden="true" />

            {t("RecordModel.configurationDeletion.deleteList")}
          </DropdownMenuItem>
        </TopBarMenuButton>
      )}

      {selected ? (
        <TopBarMenuButton primary disabled={disabled} icon={Plus} label={t("Common.actions.add")}>
          <DropdownMenuItem onSelect={() => onAdd("list")}>
            <List aria-hidden="true" />

            {t("RecordModel.addMenu.list")}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <ConfigureListAddItems
            channels={!recordChannelsField(model, selected.id)}
            sublist={canAddSublist && !selected.embedded}
            onAdd={onAdd}
          />
        </TopBarMenuButton>
      ) : (
        <TopBarPrimaryButton disabled={disabled} label={t("Common.actions.add")} onClick={() => onAdd("list")} />
      )}
    </div>
  );
});
