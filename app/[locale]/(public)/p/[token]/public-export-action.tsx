"use client";

import { Check, Download } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { ResponsiveOverlay } from "@/components/modal";
import { Button } from "@/components/ui/button";

import { publicSignupHref } from "./public-signup";

export function PublicExportAction({ id, count }: { id: string; count: number }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const benefits = [
    t("PublicLink.export.benefits.export"),
    t("PublicLink.export.benefits.build"),
    t("PublicLink.export.benefits.share"),
  ];

  return (
    <ResponsiveOverlay
      align="end"
      footer={
        <Button asChild className="w-full" id={`${id}-signup`}>
          <a href={publicSignupHref("export")}>{t("PublicLink.export.cta")}</a>
        </Button>
      }
      open={open}
      popoverClassName="w-80"
      title={t("PublicLink.export.title")}
      trigger={
        <Button
          aria-label={t("PublicLink.export.label")}
          className="text-muted-foreground"
          id={id}
          size="icon-sm"
          variant="ghost"
        >
          <Download className="size-3.5" />
        </Button>
      }
      onOpenChange={setOpen}
    >
      <div className="flex flex-col gap-3 px-3 in-data-[slot=drawer-content]:px-4">
        <p className="text-sm text-muted-foreground" id={`${id}-body`}>
          {t("PublicLink.export.body", { count })}
        </p>

        <ul className="flex flex-col gap-1.5 text-sm" id={`${id}-benefits`}>
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />

              {benefit}
            </li>
          ))}
        </ul>
      </div>
    </ResponsiveOverlay>
  );
}
