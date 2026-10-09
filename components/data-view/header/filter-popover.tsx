"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { FilterTargetPopover } from "@/components/data-view/filter-palette/filter-target-popover";
import { useViewAi } from "@/components/data-view/views/use-view-ai";
import { AskAiAction } from "@/components/ui/ask-ai-action";

type Props = { store: BaseDataViewStore<any>; compact?: boolean; id?: string };

export const FilterPopover = observer(function FilterPopover({ store, compact, id }: Props) {
  const ai = useViewAi(store, { registerPageContext: false, entry: "filters" });
  const pendingAi = useRef<(() => void) | null>(null);
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
