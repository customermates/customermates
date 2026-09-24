"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { OVERLAY_ICON_CONTROL_CLASS, OVERLAY_ICON_CONTROL_NEUTRAL_CLASS } from "@/components/ui/overlay-contract";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";

export function ViewAiAction({ id, className, onClick }: { id?: string; className?: string; onClick: () => void }) {
  const t = useTranslations();

  return (
    <button
      className={cn(
        OVERLAY_ICON_CONTROL_CLASS,
        OVERLAY_ICON_CONTROL_NEUTRAL_CLASS,
        "inline-flex w-auto items-center justify-center gap-2 whitespace-nowrap text-sm font-medium leading-4",
        className,
      )}
      id={id}
      type="button"
      onClick={() => runUserAction(onClick)}
    >
      <span>{t("DataView.views.askAi")}</span>

      <Sparkles aria-hidden className="size-4" />
    </button>
  );
}
