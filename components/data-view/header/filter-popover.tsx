"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { observer } from "mobx-react-lite";
import { useCallback, useRef } from "react";
import { FilterTargetPopover } from "@/components/data-view/filter-palette/filter-target-popover";
import { useViewAi } from "@/components/data-view/views/use-view-ai";
import { AppModalActionRail } from "@/components/modal/app-modal-action";
import { useAskAiAction } from "@/components/ui/ask-ai-action";
import { ViewChangesNotice } from "@/components/data-view/views/view-changes-notice";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = { store: BaseDataViewStore<any>; compact?: boolean; searchLabel?: string; id?: string };

export const FilterPopover = observer(function FilterPopover({ store, compact, searchLabel, id }: Props) {
  const ai = useViewAi(store, { registerPageContext: false, entry: "filters" });
  const askAiAction = useAskAiAction();
  const { keyboardShortcutsStore } = useRootStore();
  const pendingAi = useRef<(() => void) | null>(null);
  const registerOpener = useCallback(
    (open: () => void) => {
      keyboardShortcutsStore.registerFilterOpener(open);
      return () => keyboardShortcutsStore.unregisterFilterOpener(open);
    },
    [keyboardShortcutsStore],
  );
  const search = searchLabel
    ? {
        label: searchLabel,
        term: store.searchTerm || undefined,
        apply: (term: string | undefined) => store.setQueryOptions({ searchTerm: term ?? "" }),
      }
    : undefined;

  return (
    <FilterTargetPopover
      compact={compact}
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
          ]}
        />
      )}
      id={id}
      notice={<ViewChangesNotice anchorScope={id} store={store} />}
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
