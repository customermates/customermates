"use client";

import type { LucideIcon } from "lucide-react";
import { Download, X } from "lucide-react";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

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
}: Props) {
  const body = (
    <>
      <Icon className={cn("size-5 shrink-0", accent)} icon={fileIcon} />

      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate font-medium">{name}</span>

        {subtitle ? <span className="text-muted-foreground truncate text-[11px]">{subtitle}</span> : null}
      </span>
    </>
  );

  const downloadIcon = <Icon className="text-muted-foreground size-4 shrink-0" icon={Download} />;

  if (onRemove) {
    return (
      <div className={cn(attachmentRowClass(false), className)}>
        <button className="flex min-w-0 flex-1 items-center gap-2.5" title={name} type="button" onClick={onOpen}>
          {body}
        </button>

        <button
          aria-label={removeLabel}
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
          type="button"
          onClick={onRemove}
        >
          <Icon className="size-4" icon={X} />
        </button>
      </div>
    );
  }

  if (href) {
    return (
      <a
        className={cn(attachmentRowClass(true), className)}
        download={download}
        href={href}
        rel="noreferrer"
        title={name}
      >
        {body}

        {downloadIcon}
      </a>
    );
  }

  return (
    <button className={cn(attachmentRowClass(true), className)} title={name} type="button" onClick={onOpen}>
      {body}

      {downloadIcon}
    </button>
  );
}
