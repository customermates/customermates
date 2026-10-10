"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AppModalButtonActionProps } from "@/components/modal/app-modal-action";

import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";

export const ASK_AI_ACTION_CLASS =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

export function AskAiAction({
  id,
  className,
  placement = "overlay",
  onClick,
}: {
  id?: string;
  className?: string;
  placement?: "overlay" | "topbar";
  onClick: () => void | Promise<void>;
}) {
  const t = useTranslations();

  return (
    <button
      className={cn(ASK_AI_ACTION_CLASS, className)}
      data-slot="ask-ai-action"
      id={id}
      type="button"
      onClick={() => runUserAction(onClick)}
    >
      <Sparkles aria-hidden />

      <span className={cn(placement === "topbar" && "max-sm:sr-only")}>{t("DataView.views.askAi")}</span>
    </button>
  );
}

export function useAskAiAction() {
  const t = useTranslations();

  return ({
    anchorId,
    onClick,
  }: {
    anchorId?: string;
    onClick: () => void | Promise<void>;
  }): AppModalButtonActionProps => ({
    id: "ask-ai",
    kind: "assistant",
    anchorId,
    icon: Sparkles,
    label: t("DataView.views.askAi"),
    onClick,
  });
}
