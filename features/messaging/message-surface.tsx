import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  children?: ReactNode;
  isOutbound: boolean;
  isEmail: boolean;
  className?: string;
};

export function MessageSurface({ children, isOutbound, isEmail, className }: Props) {
  return (
    <div
      className={cn(
        "bg-card flex min-w-0 flex-col overflow-hidden rounded-xl text-sm shadow-xs",
        isOutbound ? "rounded-br-md" : "rounded-bl-md",
        isEmail ? "w-full" : "w-fit max-w-full",
        className,
      )}
    >
      {children}
    </div>
  );
}
