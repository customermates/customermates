"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppImage } from "@/components/shared/app-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

type Props = {
  className?: string;
};

function FounderIdentity({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <AppImage alt="" className="size-9 shrink-0 rounded-lg" height={40} src="benjamin-wagner.png" width={40} />

      <div className="min-w-0">
        <p className="truncate text-sm font-medium">Benjamin Wagner</p>

        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

export function FounderContactCard({ className }: Props) {
  const t = useTranslations();
  const subtitle = t("ContactPage.highlights.personal.title");

  return (
    <section
      data-founder-contact
      aria-label={subtitle}
      className={cn("border-t border-border pt-4", className)}
      data-founder-contact-variant="note"
    >
      <FounderIdentity subtitle={subtitle} />

      <p className="mt-4 text-xs leading-5 text-muted-foreground">{t("ContactPage.highlights.personal.body")}</p>

      <Button asChild className="mt-2 h-auto justify-start px-0 py-1 text-xs" size="xs" variant="link">
        <IntlLink href="/contact">
          {t("Common.actions.contact")}

          <ArrowUpRight aria-hidden className="size-3.5" />
        </IntlLink>
      </Button>
    </section>
  );
}
