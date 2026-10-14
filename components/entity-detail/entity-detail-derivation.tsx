"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";

import { AppModalActionRail } from "@/components/modal/app-modal-action";
import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { iconButtonClass } from "@/components/ui/icon-button-styles";
import { cn } from "@/core/utils/cn";

type Props = {
  icon: LucideIcon;
  label: string;
  configureHref?: string | null;
  children: ReactNode | ((context: DerivationContext) => ReactNode);
};

export type DerivationContext = { anchor: HTMLElement | null; close: () => void };

export function EntityDetailDerivation({ icon: Icon, label, configureHref, children }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <ResponsiveOverlay
      align="end"
      headerAction={
        configureHref ? (
          <AppModalActionRail
            actions={[
              {
                id: "edit-in-configure",
                icon: Settings2,
                label: t("EntityDetail.editInConfigure"),
                href: configureHref,
              },
            ]}
          />
        ) : undefined
      }
      open={open}
      popoverClassName="w-[min(22rem,var(--radix-popover-content-available-width))]"
      title={label}
      trigger={
        <button
          ref={triggerRef}
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
        {typeof children === "function"
          ? children({ anchor: triggerRef.current, close: () => setOpen(false) })
          : children}
      </div>
    </ResponsiveOverlay>
  );
}
