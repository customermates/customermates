"use client";

import type { ComponentProps } from "react";

import { useState } from "react";
import { Clipboard, Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";

import { ClickableChip } from "./clickable-chip";

type Props = Omit<ComponentProps<typeof ClickableChip>, "onClick"> & {
  value: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
};

export function CopyableChip({ value, onClick, children, ...props }: Props) {
  const t = useTranslations();
  const copy = useCopyToClipboard();
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  async function handleCopy() {
    const ok = await copy(value);
    if (!ok) return;
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    onClick?.(e);
    e.stopPropagation();
    void handleCopy();
  }

  function getIcon() {
    const icon = isCopied ? (
      <Icon className="text-green-600" icon={Check} size="sm" />
    ) : (
      <Icon className={isHovered ? "" : "opacity-0"} icon={Clipboard} size="sm" />
    );

    return <span className="inline-flex min-h-3 min-w-3 items-center justify-center">{icon}</span>;
  }

  return (
    <ClickableChip
      {...props}
      tooltip={t("Common.actions.copy")}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="relative inline-flex max-w-full items-center">
        <span className="truncate" style={isHovered || isCopied ? { maxWidth: "calc(100% - 0.75rem)" } : undefined}>
          {children}
        </span>

        <span className="pointer-events-none absolute inset-y-0 right-0 mb-0.5 flex items-center">{getIcon()}</span>
      </span>
    </ClickableChip>
  );
}
