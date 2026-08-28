"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppImage } from "@/components/shared/app-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

export function FounderContactCard({ className }: { className?: string }) {
  const t = useTranslations();

  return (
    <section
      data-founder-contact
      aria-label={t("ContactPage.highlights.personal.title")}
      className={cn("rounded-xl border border-border bg-background p-4", className)}
    >
      <div className="flex items-center gap-3">
        <AppImage alt="" className="size-10 shrink-0 rounded-lg" height={40} src="benjamin-wagner.png" width={40} />

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Benjamin Wagner</p>

          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {t("ContactPage.highlights.personal.title")}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">{t("ContactPage.highlights.personal.body")}</p>

      <Button asChild className="mt-4 w-full" size="sm">
        <IntlLink href="/contact">
          {t("Common.actions.contact")}

          <ArrowUpRight aria-hidden className="size-3.5" />
        </IntlLink>
      </Button>
    </section>
  );
}
