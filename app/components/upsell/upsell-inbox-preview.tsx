import { CheckCircle2, CornerDownRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Google, Linkedin, Whatsapp } from "@/components/icons/channel-icon";
import { AppImage } from "@/components/shared/app-image";

import { UpsellPreviewFrame, UpsellPreviewTitle } from "./upsell-preview-frame";

type Props = {
  className?: string;
};

export function UpsellInboxPreview({ className }: Props) {
  const t = useTranslations();

  return (
    <UpsellPreviewFrame className={className} label={t("Upsell.preview.label")}>
      <UpsellPreviewTitle
        aside={
          <span className="flex items-center gap-1">
            <Linkedin className="size-3.5" size={14} />

            <Google className="size-3.5" size={14} />

            <Whatsapp className="size-3.5" size={14} />
          </span>
        }
      >
        {t("NavigationBar.inbox")}
      </UpsellPreviewTitle>

      <div aria-hidden className="flex items-start gap-2.5 rounded-lg bg-accent px-2.5 py-2">
        <Linkedin className="mt-0.5 size-4 shrink-0" size={16} />

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-foreground">{t("Upsell.preview.firstName")}</span>

            <span className="shrink-0 text-[11px] text-muted-foreground">{t("Upsell.preview.firstTime")}</span>
          </span>

          <span className="block truncate text-xs text-muted-foreground">{t("Upsell.preview.firstMessage")}</span>
        </span>
      </div>

      <div aria-hidden className="flex items-start gap-2.5 px-2.5 py-2">
        <Google className="mt-0.5 size-4 shrink-0" size={16} />

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-foreground">{t("Upsell.preview.secondName")}</span>

            <span className="shrink-0 text-[11px] text-muted-foreground">{t("Upsell.preview.secondTime")}</span>
          </span>

          <span className="block truncate text-xs text-muted-foreground">{t("Upsell.preview.secondMessage")}</span>
        </span>
      </div>

      <div aria-hidden className="mx-1 mb-1 rounded-lg bg-card p-2.5 ring-1 ring-border-strong ring-inset">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <AppImage
            alt=""
            className="size-3.5 shrink-0 rounded-[3px]"
            height={14}
            src="customermates-square.svg"
            width={14}
          />

          {t("Upsell.preview.draftBadge")}
        </span>

        <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-foreground">
          {t("Upsell.preview.draftText")}
        </span>

        <span className="mt-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <CheckCircle2 className="size-3 shrink-0 text-muted-foreground" />

            <span className="truncate">{t("Upsell.preview.nextStep")}</span>
          </span>

          <span className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-foreground">
              {t("Inbox.compose.draftEdit")}
            </span>

            <span className="inline-flex items-center gap-1 rounded-md bg-foreground px-2 py-0.5 text-[11px] text-background">
              <CornerDownRight className="size-3" />

              {t("Inbox.compose.draftSendNow")}
            </span>
          </span>
        </span>
      </div>
    </UpsellPreviewFrame>
  );
}
