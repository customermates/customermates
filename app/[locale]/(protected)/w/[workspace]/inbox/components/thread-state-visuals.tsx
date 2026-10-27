import type { ChipColor } from "@/constants/chip-colors";
import type { MessagingThreadState } from "@/generated/prisma";

import { cn } from "@/core/utils/cn";

export const THREAD_STATE_DOT: Record<MessagingThreadState, string> = {
  unread: "bg-warning",
  open: "bg-info",
  closed: "bg-muted-foreground",
  spam: "bg-destructive",
};

export const THREAD_STATE_CHIP_COLOR: Record<MessagingThreadState, ChipColor> = {
  unread: "warning",
  open: "info",
  closed: "secondary",
  spam: "destructive",
};

export function ThreadStateDot({ state, className }: { state: MessagingThreadState; className?: string }) {
  return <span className={cn("size-2 shrink-0 rounded-full", THREAD_STATE_DOT[state], className)} />;
}
