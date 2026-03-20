"use client";

import type { PopoverContentProps } from "@heroui/popover";
import type { ReactNode } from "react";

import { ArrowsPointingOutIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { PopoverContent } from "@heroui/popover";
import { useDraggable } from "@heroui/modal";
import { useTranslations } from "next-intl";

import { XIcon } from "../x-icon";
import { XTooltip } from "../x-tooltip";

type Props = PopoverContentProps & {
  children: ReactNode;
  onClose?: () => void;
  popoverRef: React.RefObject<HTMLDivElement>;
  isOpen?: boolean;
  isDraggable?: boolean;
};

export function XPopoverContent({
  children,
  onClose,
  popoverRef,
  isOpen = true,
  className = "p-3 relative flex flex-col gap-2",
  isDraggable = true,
  ...props
}: Props) {
  const t = useTranslations("Common");
  const { moveProps } = useDraggable({ targetRef: popoverRef, isDisabled: !isOpen });

  return (
    <PopoverContent className={className} {...props}>
      <XTooltip content={t("actions.close")} placement="right">
        <button
          aria-label={t("ariaLabels.close")}
          className="absolute top-0 right-0 translate-x-[115%] cursor-pointer outline-transparent box-border text-small bg-content1 rounded-full shadow-medium p-3 select-none z-10"
          tabIndex={-1}
          type="button"
          onClick={onClose}
        >
          <XIcon icon={XMarkIcon} size="sm" />
        </button>
      </XTooltip>

      {isDraggable && (
        <XTooltip content={t("ariaLabels.dragToMove")} placement="right">
          <div
            className="absolute top-10 right-0 translate-x-[115%] cursor-move outline-transparent box-border text-small bg-content1 rounded-full shadow-medium p-3 select-none z-10"
            {...moveProps}
          >
            <XIcon icon={ArrowsPointingOutIcon} size="sm" />
          </div>
        </XTooltip>
      )}

      {children}
    </PopoverContent>
  );
}
