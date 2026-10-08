"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { useRootStore } from "@/core/stores/root-store.provider";
import { RecordEditor } from "@/app/[locale]/(protected)/records/[typeId]/components/record-editor";
import { AppModal } from "@/components/modal/app-modal";

export const WorkspaceRecordEditor = observer(function WorkspaceRecordEditor() {
  const store = useRootStore().recordWorkspaceStore;
  const t = useTranslations();
  return (
    <>
      <AppModal
        sheet
        bodyClassName="flex items-center gap-2 px-6 text-sm"
        open={store.isOpening}
        title={t("PageState.loading")}
        onClose={() => store.close()}
      >
        <span className="flex items-center gap-2" role="status">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />

          {t("PageState.loading")}
        </span>
      </AppModal>

      {store.editor && <RecordEditor store={store.editor} />}
    </>
  );
});
