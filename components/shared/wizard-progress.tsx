type Props = {
  current: number;
  label: string;
  total: number;
  valueText: string;
};

export function WizardProgress({ current, label, total, valueText }: Props) {
  return (
    <div
      aria-label={label}
      aria-valuemax={total}
      aria-valuemin={1}
      aria-valuenow={current}
      aria-valuetext={valueText}
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
    >
      <div
        className="h-full bg-primary transition-[width] motion-reduce:transition-none"
        style={{ width: `${(current / total) * 100}%` }}
      />
    </div>
  );
}
