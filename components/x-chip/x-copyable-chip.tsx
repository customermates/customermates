"use client";

import type { ChipProps } from "@heroui/chip";

import { useState } from "react";
import { ClipboardIcon, CheckIcon } from "@heroicons/react/24/outline";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";

import { XIcon } from "../x-icon";

import { XClickableChip } from "./x-clickable-chip";

type Props = ChipProps & {
  value: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
};

export function XCopyableChip({ value, onClick, ...props }: Props) {
  const t = useTranslations("");
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      addToast({
        description: t("Common.notifications.copiedToClipboard", { value }),
        color: "success",
        icon: <XIcon icon={ClipboardIcon} size="sm" />,
      });

      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch {
      addToast({
        description: t("Common.notifications.copyFailed"),
        color: "danger",
      });
    }
  }

  function handleMouseLeave() {
    setIsHovered(false);
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    onClick?.(e);
    e.stopPropagation();
    void handleCopy();
  }

  function getIcon() {
    const icon = isCopied ? (
      <XIcon className="text-success" icon={CheckIcon} size="sm" />
    ) : (
      <XIcon className={isHovered ? "" : "opacity-0"} icon={ClipboardIcon} size="sm" />
    );

    return <span className="inline-flex items-center justify-center min-w-3 min-h-3">{icon}</span>;
  }

  return (
    <XClickableChip
      {...props}
      title={t("Common.actions.copy")}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      <span className="relative inline-flex items-center max-w-full">
        <span className="truncate" style={isHovered || isCopied ? { maxWidth: "calc(100% - 0.75rem)" } : undefined}>
          {props.children}
        </span>

        <span className="absolute right-0 mb-0.25 inset-y-0 flex items-center pointer-events-none">{getIcon()}</span>
      </span>
    </XClickableChip>
  );
}
