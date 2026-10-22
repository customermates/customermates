"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { useRef } from "react";
import { Download, X } from "lucide-react";

import { Icon } from "@/components/shared/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsTruncated } from "@/core/utils/use-is-truncated";
import { cn } from "@/core/utils/cn";
import { ITEM_REVEAL_CLASS, ITEM_REVEAL_GROUP_CLASS } from "@/components/ui/item-actions";

import { attachmentRowClass } from "./attachment-classify";

type Props = {
  fileIcon: LucideIcon;
  accent: string;
  name: string;
  subtitle: string | null;
  className?: string;
  href?: string;
  download?: string;
  onOpen?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  tone?: "message" | "neutral";
  actions?: ReactNode;
};

export function AttachmentRow({
  fileIcon,
  accent,
  name,
  subtitle,
  className,
  href,
  download,
  onOpen,
  onRemove,
  removeLabel,
  tone = "message",
  actions,
}: Props) {
  const nameRef = useRef<HTMLSpanElement | null>(null);
  const isTruncated = useIsTruncated(nameRef, name);

  const body = (
    <>
      <Icon className={cn("size-5 shrink-0", accent)} icon={fileIcon} />

      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span ref={nameRef} className="truncate font-medium">
          {name}
        </span>

        {subtitle ? <span className="text-muted-foreground truncate text-[11px]">{subtitle}</span> : null}
      </span>
    </>
  );

  const downloadIcon = <Icon className="text-muted-foreground size-4 shrink-0" icon={Download} />;

  const withNameTooltip = (control: ReactElement) => {
    if (!isTruncated) return control;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{control}</TooltipTrigger>

        <TooltipContent className="max-w-xs">{name}</TooltipContent>
      </Tooltip>
    );
  };

  if (onRemove || actions) {
    return (
      <div className={cn(attachmentRowClass(false, undefined, tone), ITEM_REVEAL_GROUP_CLASS, className)}>
        {withNameTooltip(
          <button className="flex min-w-0 flex-1 items-center gap-2.5" type="button" onClick={onOpen}>
            {body}
          </button>,
        )}

        {actions}

        {onRemove && (
          <button
            aria-label={removeLabel}
            className={cn(
              "text-muted-foreground hover:text-foreground shrink-0 transition-colors",
              tone === "neutral" && cn("size-7 rounded-md", ITEM_REVEAL_CLASS),
            )}
            type="button"
            onClick={onRemove}
          >
            <Icon className="size-4" icon={X} />
          </button>
        )}
      </div>
    );
  }

  if (href) {
    return withNameTooltip(
      <a
        className={cn(attachmentRowClass(true, undefined, tone), className)}
        download={download}
        href={href}
        rel="noreferrer"
      >
        {body}

        {downloadIcon}
      </a>,
    );
  }

  return withNameTooltip(
    <button className={cn(attachmentRowClass(true, undefined, tone), className)} type="button" onClick={onOpen}>
      {body}

      {downloadIcon}
    </button>,
  );
}
