"use client";

import type { PublicFormTabStore } from "./public-form-tab.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { SegmentedControl } from "@/components/ui/segmented-control";

import { PublicFormView } from "./public-form-view";

export const PublicFormPreview = observer(function PublicFormPreview({ store }: { store: PublicFormTabStore }) {
  const t = useTranslations();
  const { draft, preview, previewMode } = store;
  if (!draft || !preview) return null;

  return (
    <section
      aria-label={t("PublicForm.builder.sectionPreview")}
      className="flex flex-col gap-3"
      id="public-form-section-preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("PublicForm.builder.sectionPreview")}</h3>

        <SegmentedControl<"form" | "done">
          idPrefix="public-form-preview"
          items={[
            { value: "form", label: t("PublicForm.builder.sectionPreviewForm"), controls: false as const },
            { value: "done", label: t("PublicForm.builder.sectionPreviewDone"), controls: false as const },
          ]}
          label={t("PublicForm.builder.sectionPreviewMode")}
          value={previewMode}
          onValueChange={store.setPreviewMode}
        />
      </div>

      <div
        className="mx-auto w-full max-w-[23rem] overflow-hidden rounded-[2rem] border-4 border-border bg-background shadow-sm"
        data-form-preview-frame=""
        id="public-form-preview"
      >
        <div className="max-h-[38rem] overflow-y-auto p-3">
          <PublicFormView
            embedded
            doneMessage={previewMode === "done" ? draft.successMessage : undefined}
            form={preview}
            locale={draft.locale || "en"}
            token=""
          />
        </div>
      </div>
    </section>
  );
});
