"use client";

import type { ContactKind } from "@/core/utils/contact-href";

import { Copy, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { IconButton } from "@/components/ui/icon-button";
import { CopyableText } from "@/components/shared/copyable-text";
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

export function ContactValue({ value, kind, action = "open", label, className, wrap = false }: Props) {
  const t = useTranslations();

  return (
    <span
      className={cn("inline-flex min-w-0 max-w-full items-center align-baseline", className)}
      data-contact-action={action}
      data-slot="contact-value"
    >
      <CopyableText
        ariaLabel={label ?? value}
        copyLabel={t(`RecordModel.clickActions.${kind}.copy`)}
        label={label}
        link={
          action === "open"
            ? {
                href: contactHref(kind, value),
                external: kind === "url" || kind === "address",
              }
            : undefined
        }
        multiline={kind === "address"}
        value={value}
        wrap={wrap}
      />
    </span>
  );
}

const OPEN_ICONS = { email: Mail, phone: Phone, url: ExternalLink, address: MapPin } as const;

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
