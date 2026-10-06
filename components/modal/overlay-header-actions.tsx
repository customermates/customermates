import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

/**
 * Icon action row rendered inside an overlay header, vertically centred on the overlay's Close button.
 * Place it as the last child of a header row whose right padding clears the Close button.
 */
export function OverlayHeaderActions({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TooltipProvider>
      <div
        className={cn("flex min-h-9 shrink-0 items-center gap-2 self-start empty:hidden", className)}
        data-slot="app-modal-actions"
        id={id}
      >
        {children}
      </div>
    </TooltipProvider>
  );
}
