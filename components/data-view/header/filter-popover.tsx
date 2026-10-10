"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { RotateCcw } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { FilterTargetPopover } from "@/components/data-view/filter-palette/filter-target-popover";
import { useViewAi } from "@/components/data-view/views/use-view-ai";
import { AppModalActionRail } from "@/components/modal/app-modal-action";
import { useAskAiAction } from "@/components/ui/ask-ai-action";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModalCloseContext } from "@/components/modal/app-modal-close-context";

type Props = { store: BaseDataViewStore<any>; compact?: boolean; id?: string };

export const FilterPopover = observer(function FilterPopover({ store, compact, id }: Props) {
  const t = useTranslations();
  const ai = useViewAi(store, { registerPageContext: false, entry: "filters" });
  const askAiAction = useAskAiAction();
  const pendingAi = useRef<(() => void) | null>(null);
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
                    onClick: store.resetQueryToView,
                  },
                ]
              : []),
          ]}
        />
      )}
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
