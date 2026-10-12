"use client";

import type { ReactNode } from "react";

import { ChevronLeft } from "lucide-react";

export function OverlayBackTitle({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <button
      className="flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-overlay-back=""
      type="button"
      onClick={onBack}
    >
      <ChevronLeft aria-hidden className="size-3.5" />

      {children}
    </button>
  );
}
