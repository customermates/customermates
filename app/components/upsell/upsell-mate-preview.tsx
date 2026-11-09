import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppImage } from "@/components/shared/app-image";

import { UpsellPreviewFrame, UpsellPreviewTitle } from "./upsell-preview-frame";

type Props = {
  className?: string;
};

export function UpsellMatePreview({ className }: Props) {
  const t = useTranslations();

  return (
    <UpsellPreviewFrame className={className} label={t("Upsell.preview.mate.label")}>
      <UpsellPreviewTitle>{t("AgentChat.title")}</UpsellPreviewTitle>

      <div aria-hidden className="flex flex-col gap-2.5 px-2.5 py-1.5">
        <div className="flex justify-end">
          <span className="max-w-[85%] rounded-xl rounded-br-md bg-muted px-3 py-1.5 text-xs leading-5 text-foreground dark:bg-accent/60">
            {t("Upsell.preview.mate.question")}
          </span>
        </div>

        <div className="flex items-start gap-2">
          <AppImage
            alt=""
            className="mt-0.5 size-4 shrink-0 rounded-[3px]"
            height={16}
            src="customermates-square.svg"
            width={16}
          />

          <span className="text-xs leading-5 text-foreground">{t("Upsell.preview.mate.answer")}</span>
        </div>
      </div>

      <div
        aria-hidden
        className="mx-1 mb-1 flex items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-2 ring-1 ring-border-strong ring-inset"
      >
        <span className="truncate text-xs text-muted-foreground">{t("AgentChat.placeholder")}</span>

        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <ArrowUp className="size-3" />
        </span>
      </div>
    </UpsellPreviewFrame>
  );
}
