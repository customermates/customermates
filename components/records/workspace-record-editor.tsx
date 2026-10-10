"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useRootStore } from "@/core/stores/root-store.provider";
import { RecordEditor } from "@/app/[locale]/(protected)/records/[typeId]/components/record-editor";
import { AppModal } from "@/components/modal/app-modal";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_FIELDS = ["w-24", "w-20", "w-28", "w-24", "w-16"];

export const WorkspaceRecordEditor = observer(function WorkspaceRecordEditor() {
  const store = useRootStore().recordWorkspaceStore;
  const t = useTranslations();
  return (
    <>
      <AppModal
        focusContentOnOpen
        sheet
        bodyClassName="p-0"
        open={store.isOpening}
        title={t("PageState.loading")}
        onClose={() => store.close()}
        onCloseAutoFocus={(event) => {
          if (store.editor?.isOpen) event.preventDefault();
        }}
      >
        <div aria-label={t("PageState.loading")} className="flex flex-col" data-record-editor-skeleton="" role="status">
          <div className="p-6 pb-4">
            <Skeleton className="h-7 w-48" />
          </div>

          <div className="flex gap-2 border-b border-border px-4 pb-4">
            <Skeleton className="h-14 w-20 rounded-lg" />

            <Skeleton className="h-14 w-28 rounded-lg" />

            <Skeleton className="h-14 w-24 rounded-lg" />
          </div>

          <div className="p-6 pb-2">
            <Skeleton className="h-8 w-full rounded-md" />
          </div>

          <div className="flex flex-col gap-5 px-6 py-4">
            {SKELETON_FIELDS.map((width, index) => (
              <div key={index} className="flex flex-col gap-2">
                <Skeleton className={`h-4 ${width}`} />

                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </AppModal>

      {store.editor && <RecordEditor store={store.editor} />}
    </>
  );
});
