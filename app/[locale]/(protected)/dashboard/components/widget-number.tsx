import { Rows3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type Props = {
  caption: string;
  value: string;
};

export function WidgetNumber({ caption, value }: Props) {
  return (
    <div className="@container flex min-h-0 flex-1 flex-col justify-center gap-2" data-slot="widget-number">
      <p
        className="font-semibold leading-none tracking-tight tabular-nums whitespace-nowrap"
        style={{ fontSize: `min(2.25rem, ${(160 / Math.max(value.length, 1)).toFixed(2)}cqw)` }}
      >
        {value}
      </p>

      <Badge className="gap-1 self-start font-normal tabular-nums" variant="secondary">
        <Rows3 aria-hidden className="size-3" />

        {caption}
      </Badge>
    </div>
  );
}
