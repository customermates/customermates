"use client";

import type { FormEvent, ReactNode } from "react";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { runUserAction } from "@/core/errors/report-application-error";

export type ViewMetaMode = "create" | "duplicate" | "edit";

const FORM_ID = "view-editor-form";
const NAME_LIMIT = 60;

type Props = {
  mode: ViewMetaMode;
  name: string;
  open: boolean;
  trigger: ReactNode;
  onChange: (draft: { name: string }) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: { name: string }) => Promise<void>;
};

export function ViewMetaOverlay({ mode, name, open, trigger, onChange, onOpenChange, onSubmit }: Props) {
  const t = useTranslations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trimmed = name.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    runUserAction(async () => {
      try {
        await onSubmit({ name: trimmed });
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  const footer = (
    <>
      <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
        {t("Common.actions.cancel")}
      </Button>

      <Button disabled={!trimmed || isSubmitting} form={FORM_ID} size="sm" type="submit">
        {t("Common.actions.save")}
      </Button>
    </>
  );

  return (
    <ResponsiveOverlay
      align="end"
      footer={footer}
      open={open}
      popoverClassName="w-80"
      title={mode === "edit" ? t("DataView.views.editTitle") : t("DataView.views.createTitle")}
      trigger={trigger}
      onOpenChange={onOpenChange}
    >
      <form className="flex flex-col gap-3 p-3" id={FORM_ID} onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="view-editor-name">{t("DataView.views.name")}</Label>

          <Input
            autoFocus
            required
            id="view-editor-name"
            maxLength={NAME_LIMIT}
            placeholder={t("DataView.views.namePlaceholder")}
            value={name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>
      </form>
    </ResponsiveOverlay>
  );
}
