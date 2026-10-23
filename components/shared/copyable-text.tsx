"use client";

import type { ReactNode, Ref } from "react";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";

type Props = {
  value: string;
  label?: ReactNode;
  className?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  ariaLabel?: string;
  copyLabel?: string;
  link?: { href: string | null; external?: boolean };
  wrap?: boolean;
};

const containerClass = "group/copyable-text relative inline-flex min-w-0 max-w-full items-center align-baseline";
const controlClass =
  "cursor-pointer rounded-xs p-0 text-left outline-none hover:bg-accent active:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50";
const labelClass =
  "min-w-0 max-w-full group-hover/copyable-text:max-w-[calc(100%_-_1.25em)] group-focus-within/copyable-text:max-w-[calc(100%_-_1.25em)]";
const actionClass =
  "absolute top-1/2 right-0 -translate-y-1/2 opacity-0 transition-[opacity,scale] duration-150 group-hover/copyable-text:opacity-60 group-focus-within/copyable-text:opacity-60 motion-safe:group-active/copyable-text:scale-90 motion-reduce:transition-none";

export function CopyableText({ value, label, className, buttonRef, ariaLabel, copyLabel, link, wrap = false }: Props) {
  const t = useTranslations();
  const copy = useCopyToClipboard();
  if (!value) return null;
  const actionLabel = copyLabel ?? t("Common.actions.copy");
  const textClass = wrap ? "break-all whitespace-normal" : "truncate";

  const copyButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          aria-label={link ? actionLabel : (ariaLabel ?? `${actionLabel} ${value}`)}
          className={cn(
            controlClass,
            link
              ? cn(actionClass, "inline-flex size-[1.25em] items-center justify-center touch-input:opacity-60")
              : cn(containerClass, className),
          )}
          data-slot={link ? "copyable-text-action" : "copyable-text"}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            runUserAction(() => copy(value));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
          }}
        >
          {!link && <span className={cn(labelClass, textClass)}>{label ?? value}</span>}

          <Copy aria-hidden className={cn("pointer-events-none size-[0.85em]", !link && actionClass)} />
        </button>
      </TooltipTrigger>

      <TooltipContent>{link ? actionLabel : value}</TooltipContent>
    </Tooltip>
  );

  if (!link) return copyButton;

  const linkedTextClass = cn(labelClass, textClass, "touch-input:max-w-[calc(100%_-_1.25em)]");
  return (
    <span className={cn(containerClass, className)} data-slot="copyable-text">
      <Tooltip>
        <TooltipTrigger asChild>
          {link.href ? (
            <a
              className={cn(controlClass, linkedTextClass, "underline-offset-2 hover:underline")}
              href={link.href}
              rel={link.external ? "noopener noreferrer" : undefined}
              target={link.external ? "_blank" : undefined}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.stopPropagation();
              }}
            >
              {label ?? value}
            </a>
          ) : (
            <span className={linkedTextClass}>{label ?? value}</span>
          )}
        </TooltipTrigger>

        <TooltipContent>{value}</TooltipContent>
      </Tooltip>

      {copyButton}
    </span>
  );
}
