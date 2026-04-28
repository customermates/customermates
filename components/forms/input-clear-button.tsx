"use client";

import { XIcon } from "lucide-react";

type Props = {
  onClear: () => void;
};

export function InputClearButton({ onClear }: Props) {
  return (
    <span
      aria-label="Clear"
      className="ml-2 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
      role="button"
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClear();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClear();
        }
      }}
    >
      <XIcon className="size-3" />
    </span>
  );
}
