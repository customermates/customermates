"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { RotateCcw } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { FilterTargetPopover } from "@/components/data-view/filter-palette/filter-target-popover";
import { useViewAi } from "@/components/data-view/views/use-view-ai";
import { useColumnLabel } from "@/components/data-view/use-column-label";
import { AppModalActionRail } from "@/components/modal/app-modal-action";
import { useAskAiAction } from "@/components/ui/ask-ai-action";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModalCloseContext } from "@/components/modal/app-modal-close-context";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = { store: BaseDataViewStore<any>; compact?: boolean; searchable?: boolean; id?: string };

export const FilterPopover = observer(function FilterPopover({ store, compact, searchable = false, id }: Props) {
  const t = useTranslations();
  const ai = useViewAi(store, { registerPageContext: false, entry: "filters" });
  const askAiAction = useAskAiAction();
  const columnLabel = useColumnLabel();
  const { keyboardShortcutsStore } = useRootStore();
  const pendingAi = useRef<(() => void) | null>(null);
  const registerOpener = useCallback(
    (open: () => void) => {
      keyboardShortcutsStore.registerFilterOpener(open);
      return () => keyboardShortcutsStore.unregisterFilterOpener(open);
    },
    [keyboardShortcutsStore],
  );
  const search = searchable
    ? {
        label:
          store.columnsDefinition.find((column) => column.uid === store.primaryColumnId)?.label ||
          columnLabel(store.primaryColumnId),
        term: store.searchTerm || undefined,
        apply: (term: string | undefined) => store.setQueryOptions({ searchTerm: term ?? "" }),
      }
    : undefined;

  return (
    <FilterTargetPopover
      compact={compact}
      footerAction={
        store.isQueryModified && (
          <AppModalCloseContext.Provider value={null}>
            <FormFooterActions dirty editable anchorScope={id} placement="overlay" onSave={store.saveQueryToView} />
          </AppModalCloseContext.Provider>
        )
      }
      headerAction={(close) => (
        <AppModalActionRail
          actions={[
            ...(ai.available
              ? [
                  askAiAction({
                    anchorId: id ? `${id}-ask-ai` : undefined,
                    onClick: () => {
                      pendingAi.current = ai.openCurrent;
                      close();
                    },
                  }),
                ]
              : []),
            ...(store.isQueryModified
              ? [
                  {
                    id: "reset-view-changes",
                    anchorId: id ? `${id}-reset` : undefined,
                    icon: RotateCcw,
                    label: t("DataView.views.resetChanges"),
                    onClick: () => runUserAction(store.resetQueryToView),
                  },
                ]
              : []),
          ]}
        />
      )}
      id={id}
      registerOpener={compact ? undefined : registerOpener}
      search={search}
      store={store}
      onCloseAutoFocus={(event) => {
        const handoff = pendingAi.current;
        if (!handoff) return;
        event.preventDefault();
        pendingAi.current = null;
        handoff();
      }}
    />
  );
});
