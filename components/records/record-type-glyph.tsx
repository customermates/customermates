import { cn } from "@/core/utils/cn";

import { recordTypeIcon } from "./record-type-icon";

export function RecordTypeGlyph({ icon, className }: { icon: string | undefined; className?: string }) {
  const Icon = recordTypeIcon(icon ?? "");
  return <Icon aria-hidden className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
}
