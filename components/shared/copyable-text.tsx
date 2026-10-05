"use client";

import type { ReactNode, Ref } from "react";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";

type Props = {
  value: string;
  label?: ReactNode;
  className?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  ariaLabel?: string;
};

export function CopyableText({ value, label, className, buttonRef, ariaLabel }: Props) {
  const t = useTranslations();
  const copy = useCopyToClipboard();
  if (!value) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={buttonRef}
            aria-label={ariaLabel ?? `${t("Common.actions.copy")} ${value}`}
            className={cn(
              "group/copyable-text hover:bg-accent active:bg-accent focus-visible:bg-accent focus-visible:ring-ring/50 relative inline-flex min-w-0 max-w-full cursor-pointer items-center rounded-xs p-0 text-left align-baseline outline-none focus-visible:ring-2",
              className,
            )}
            data-slot="copyable-text"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              runUserAction(() => copy(value));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") event.stopPropagation();
            }}
          >
            <span className="min-w-0 truncate group-hover/copyable-text:max-w-[calc(100%_-_1.25em)] group-focus-visible/copyable-text:max-w-[calc(100%_-_1.25em)]">
              {label ?? value}
            </span>

            <Copy
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-0 size-[0.85em] -translate-y-1/2 opacity-0 transition-[opacity,scale] duration-150 group-hover/copyable-text:opacity-60 group-focus-visible/copyable-text:opacity-60 motion-safe:group-active/copyable-text:scale-90 motion-reduce:transition-none"
            />
          </button>
        </TooltipTrigger>

        <TooltipContent>{t("Common.actions.copy")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
