import { cn } from "@/core/utils/cn";

type Props = {
  caption: string;
  label?: string;
  value: string;
};

function valueSize(value: string) {
  if (value.length <= 8) return "text-5xl";
  if (value.length <= 11) return "text-4xl";
  if (value.length <= 15) return "text-3xl";
  return "text-2xl [overflow-wrap:anywhere]";
}

export function WidgetNumber({ caption, label, value }: Props) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 text-center"
      data-slot="widget-number"
    >
      {label && <p className="max-w-full truncate text-sm text-muted-foreground">{label}</p>}

      <p className={cn("max-w-full font-semibold leading-tight tracking-tight tabular-nums", valueSize(value))}>
        {value}
      </p>

      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
