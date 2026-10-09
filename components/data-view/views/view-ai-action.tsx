"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";

export function ViewAiAction({ id, className, onClick }: { id?: string; className?: string; onClick: () => void }) {
  const t = useTranslations();

  return (
    <button
      aria-label={t("DataView.views.askAi")}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground", className)}
      id={id}
      type="button"
      onClick={() => runUserAction(onClick)}
    >
      <span>{t("DataView.views.askAi")}</span>

      <Sparkles aria-hidden className="size-4" />
    </button>
  );
}
