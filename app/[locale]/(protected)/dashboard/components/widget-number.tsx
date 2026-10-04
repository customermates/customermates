type Props = {
  caption: string;
  label?: string;
  value: string;
};

export function WidgetNumber({ caption, label, value }: Props) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 text-center"
      data-slot="widget-number"
    >
      {label && <p className="max-w-full truncate text-sm text-muted-foreground">{label}</p>}

      <p className="max-w-full text-4xl font-semibold leading-tight tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-5xl">
        {value}
      </p>

      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
