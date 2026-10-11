"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { Button } from "@/components/ui/button";
import { iconButtonClass } from "@/components/ui/icon-button-styles";
import { IntlLink } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";

type Props = {
  icon: LucideIcon;
  label: string;
  configureHref?: string | null;
  children: ReactNode;
};

export function EntityDetailDerivation({ icon: Icon, label, configureHref, children }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <ResponsiveOverlay
      align="end"
      open={open}
      popoverClassName="w-[min(22rem,var(--radix-popover-content-available-width))]"
      title={label}
      trigger={
        <button
          aria-label={label}
          className={cn(iconButtonClass, "size-4 hover:bg-accent hover:text-accent-foreground")}
          data-field-derivation-trigger=""
          type="button"
        >
          <Icon aria-hidden className="size-3" />
        </button>
      }
      onOpenChange={setOpen}
    >
      <div className="space-y-3 px-3 pb-3 text-sm leading-relaxed max-md:px-4" data-field-derivation="">
        {children}

        {configureHref ? (
          <Button asChild className="h-auto px-0" size="sm" variant="link">
            <IntlLink data-field-derivation-configure="" href={configureHref}>
              {t("EntityDetail.editInConfigure")}
            </IntlLink>
          </Button>
        ) : null}
      </div>
    </ResponsiveOverlay>
  );
}
