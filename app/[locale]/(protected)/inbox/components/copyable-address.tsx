"use client";

import type { Ref } from "react";

import { useTranslations } from "next-intl";

import { CopyableText } from "@/components/shared/copyable-text";
import { cn } from "@/core/utils/cn";

type Props = {
  value: string;
  label?: string;
  className?: string;
  buttonRef?: Ref<HTMLButtonElement>;
};

export function CopyableAddress({ value, label, className, buttonRef }: Props) {
  const t = useTranslations();
  const address = value.trim();
  if (!address) return null;

  return (
    <CopyableText
      ariaLabel={t("Inbox.copyAddress", { address })}
      buttonRef={buttonRef}
      className={cn("text-xs font-normal", className)}
      label={label || address}
      value={address}
    />
  );
}
