"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { useRootStore } from "@/core/stores/root-store.provider";
import { RecordEditor } from "@/app/[locale]/(protected)/records/[typeId]/components/record-editor";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";

export const WorkspaceRecordEditor = observer(function WorkspaceRecordEditor() {
  const store = useRootStore().recordWorkspaceStore;
  const t = useTranslations();
  return (
    <>
      <Sheet open={store.isOpening} onOpenChange={(open) => !open && store.close()}>
        <SheetContent aria-describedby={undefined} className="w-full gap-0 sm:max-w-[640px]" side="left">
          <SheetTitle>{t("PageState.loading")}</SheetTitle>

          <SheetBody className="flex items-center gap-2 px-6 text-sm" role="status">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />

            {t("PageState.loading")}
          </SheetBody>
        </SheetContent>
      </Sheet>

      {store.editor && <RecordEditor store={store.editor} />}
    </>
  );
});
