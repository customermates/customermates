"use client";

import type { FormEvent, ReactNode } from "react";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { runUserAction } from "@/core/errors/report-application-error";

import { ViewAiAction } from "./view-ai-action";

export type ViewMetaMode = "create" | "duplicate" | "edit";

const FORM_ID = "view-editor-form";

export const VIEW_META_NAME_INPUT_ID = "view-editor-name";
const NAME_LIMIT = 60;

type Props = {
  mode: ViewMetaMode;
  name: string;
  open: boolean;
  trigger: ReactNode;
  onChange: (draft: { name: string }) => void;
  onCreateWithAi?: (draft: { name: string }) => void;
  onAskAi?: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: { name: string }) => Promise<void>;
};

export function ViewMetaOverlay({
  mode,
  name,
  open,
  trigger,
  onChange,
  onCreateWithAi,
  onAskAi,
  onOpenChange,
  onSubmit,
}: Props) {
  const t = useTranslations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pendingAi = useRef<(() => void) | null>(null);
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
      {mode === "edit" && onAskAi && (
        <ViewAiAction
          className="mr-auto"
          id="view-editor-ask-ai"
          onClick={() => {
            pendingAi.current = onAskAi;
            onOpenChange(false);
          }}
        />
      )}

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
      onCloseAutoFocus={(event) => {
        const handoff = pendingAi.current;
        if (!handoff) return;
        event.preventDefault();
        pendingAi.current = null;
        handoff();
      }}
      onOpenChange={onOpenChange}
    >
      <form className="flex flex-col gap-3 p-3" id={FORM_ID} onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={VIEW_META_NAME_INPUT_ID}>{t("DataView.views.name")}</Label>

          <Input
            autoFocus
            required
            id={VIEW_META_NAME_INPUT_ID}
            maxLength={NAME_LIMIT}
            placeholder={t("DataView.views.namePlaceholder")}
            value={name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>

        {mode === "create" && onCreateWithAi && (
          <Button
            aria-describedby="view-editor-ai-description"
            aria-label={t("DataView.views.createWithAi")}
            className="h-auto w-full justify-start gap-3 whitespace-normal p-3 text-start"
            disabled={isSubmitting}
            id="view-editor-ai"
            type="button"
            variant="secondary"
            onClick={() => {
              pendingAi.current = () => onCreateWithAi({ name: trimmed });
              onOpenChange(false);
            }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/20 text-primary-soft-foreground">
              <Sparkles aria-hidden className="size-4" />
            </span>

            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span>{t("DataView.views.createWithAi")}</span>

              <span className="text-xs font-normal text-muted-foreground" id="view-editor-ai-description">
                {t("DataView.views.createWithAiDescription")}
              </span>
            </span>

            <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        )}
      </form>
    </ResponsiveOverlay>
  );
}
