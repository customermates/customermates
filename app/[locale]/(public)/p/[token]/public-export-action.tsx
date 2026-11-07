"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { ResponsiveOverlay } from "@/components/modal";
import { Button } from "@/components/ui/button";

import { publicSignupHref } from "./public-signup";

export function PublicExportAction({ id }: { id: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <ResponsiveOverlay
      align="end"
      footer={
        <Button asChild id={`${id}-signup`} size="sm">
          <a href={publicSignupHref("export")}>{t("PublicLink.export.cta")}</a>
        </Button>
      }
      open={open}
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
      <p className="text-sm text-muted-foreground">{t("PublicLink.export.body")}</p>
    </ResponsiveOverlay>
  );
}
