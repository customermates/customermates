"use client";

import type { ContactKind } from "@/core/utils/contact-href";

import { Copy, ExternalLink, Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { IconButton } from "@/components/ui/icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { contactHref } from "@/core/utils/contact-href";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";

export type ContactClickAction = "open" | "copy";

type Props = {
  value: string;
  kind: ContactKind;
  action?: ContactClickAction;
  label?: string;
  className?: string;
  wrap?: boolean;
};

const valueClass =
  "min-w-0 rounded-xs underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50";

export function ContactValue({ value, kind, action = "open", label, className, wrap = false }: Props) {
  const t = useTranslations();
  const copy = useCopyToClipboard();
  const href = contactHref(kind, value);
  const text = label ?? value;
  const copyValue = () => runUserAction(() => copy(value));
  const textClass = wrap ? "break-all whitespace-normal" : "truncate";

  return (
    <span
      className={cn("group/contact-value inline-flex min-w-0 max-w-full items-center gap-1 align-baseline", className)}
      data-contact-action={action}
      data-slot="contact-value"
    >
      {action === "open" ? (
        href ? (
          <a
            className={cn(valueClass, textClass)}
            href={href}
            rel={kind === "url" ? "noopener noreferrer" : undefined}
            target={kind === "url" ? "_blank" : undefined}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.stopPropagation();
            }}
          >
            {text}
          </a>
        ) : (
          <span className={cn("min-w-0", textClass)}>{text}</span>
        )
      ) : (
        <button
          className={cn(valueClass, textClass, "cursor-pointer text-left")}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            copyValue();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
          }}
        >
          {text}
        </button>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={t(`RecordModel.clickActions.${kind}.copy`)}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-muted-foreground opacity-0 outline-none transition-opacity group-hover/contact-value:opacity-100 group-focus-within/contact-value:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 any-pointer-coarse:opacity-100"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              copyValue();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") event.stopPropagation();
            }}
          >
            <Copy aria-hidden className="size-3.5" />
          </button>
        </TooltipTrigger>

        <TooltipContent>{t(`RecordModel.clickActions.${kind}.copy`)}</TooltipContent>
      </Tooltip>
    </span>
  );
}

const OPEN_ICONS = { email: Mail, phone: Phone, url: ExternalLink } as const;

export function ContactValueActions({ value, kind, action = "open" }: Omit<Props, "label" | "className" | "wrap">) {
  const t = useTranslations();
  const copy = useCopyToClipboard();
  const href = action === "open" ? contactHref(kind, value) : null;
  if (!value.trim()) return null;
  const OpenIcon = OPEN_ICONS[kind];

  return (
    <span className="flex items-center gap-0.5" data-slot="contact-value-actions">
      {href && (
        <IconButton
          external
          fieldAction
          href={href}
          icon={OpenIcon}
          label={t(`RecordModel.clickActions.${kind}.open`)}
        />
      )}

      <IconButton
        fieldAction
        icon={Copy}
        label={t(`RecordModel.clickActions.${kind}.copy`)}
        onClick={() => runUserAction(() => copy(value))}
      />
    </span>
  );
}
