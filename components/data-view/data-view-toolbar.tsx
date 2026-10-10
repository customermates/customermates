"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { ArrowDownToLine, ArrowUpFromLine, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AskAiAction } from "@/components/ui/ask-ai-action";
import { TopBarPrimaryButton, TopBarMenuButton } from "@/components/shared/top-bar-action-buttons";
import { runUserAction } from "@/core/errors/report-application-error";

import { DataViewDisplayOptions } from "./header/display-options";
import { FilterPopover } from "./header/filter-popover";
import { useViewAi } from "./views/use-view-ai";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  onAdd?: () => void;
  onExport?: () => Promise<void> | void;
  onImport?: () => void;
  isSearchable?: boolean;
  showDisplayOptions?: boolean;
  anchorScope?: string;
  addLabel?: string;
  menuItems?: ReactNode;
};

export const DataViewToolbar = observer(function DataViewToolbar<E extends HasId>({
  store,
  onAdd,
  onExport,
  onImport,
  isSearchable = true,
  showDisplayOptions = true,
  anchorScope,
  addLabel,
  menuItems,
}: Props<E>) {
  const t = useTranslations();
  const ai = useViewAi(store, { registerPageContext: false });
  if (!store.isReady) return null;

  const canExport = Boolean(onExport) && store.canExport;
  const canImport = Boolean(onImport) && store.canExport && !store.isDisabled;
  const hasMenu = canExport || canImport || Boolean(menuItems);

  return (
    <div className="flex items-center gap-1">
      {ai.available && (
        <AskAiAction
          id={anchorScope ? `${anchorScope}-ask-ai` : undefined}
          placement="topbar"
          onClick={ai.openCurrent}
        />
      )}

      <FilterPopover id={anchorScope ? `${anchorScope}-filter` : undefined} searchable={isSearchable} store={store} />

      {showDisplayOptions && (
        <DataViewDisplayOptions
          anchorScope={anchorScope}
          id={anchorScope ? `${anchorScope}-display-options` : undefined}
          store={store}
        />
      )}

      {hasMenu && (
        <TopBarMenuButton
          anchorId={anchorScope ? `${anchorScope}-more` : undefined}
          data-transfer-menu=""
          icon={MoreHorizontal}
          label={t("DataView.moreActions")}
        >
          {canExport && (
            <DropdownMenuItem onSelect={() => runUserAction(() => onExport?.())}>
              <ArrowDownToLine className="size-4" />

              {t("DataTransfer.export.action")}
            </DropdownMenuItem>
          )}

          {canImport && (
            <DropdownMenuItem onSelect={() => onImport?.()}>
              <ArrowUpFromLine className="size-4" />

              {t("DataTransfer.import.action")}
            </DropdownMenuItem>
          )}

          {menuItems}
        </TopBarMenuButton>
      )}

      {onAdd && !store.isDisabled && (
        <TopBarPrimaryButton
          anchorId={anchorScope ? `${anchorScope}-add` : undefined}
          label={addLabel ?? t("Common.actions.add")}
          onClick={onAdd}
        />
      )}
    </div>
  );
});
