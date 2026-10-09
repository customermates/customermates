"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { observer } from "mobx-react-lite";
import { useCallback, useRef } from "react";
import { FilterTargetPopover } from "@/components/data-view/filter-palette/filter-target-popover";
import { useViewAi } from "@/components/data-view/views/use-view-ai";
import { useColumnLabel } from "@/components/data-view/use-column-label";
import { AskAiAction } from "@/components/ui/ask-ai-action";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = { store: BaseDataViewStore<any>; compact?: boolean; searchable?: boolean; id?: string };

export const FilterPopover = observer(function FilterPopover({ store, compact, searchable = false, id }: Props) {
  const ai = useViewAi(store, { registerPageContext: false, entry: "filters" });
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
      headerAction={(close) =>
        ai.available && (
          <AskAiAction
            id={id ? `${id}-ask-ai` : undefined}
            onClick={() => {
              pendingAi.current = ai.openCurrent;
              close();
            }}
          />
        )
      }
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
