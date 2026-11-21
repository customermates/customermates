import { cn } from "@/core/utils/cn";

type Props = {
  className?: string;
  working?: boolean;
  label?: string;
};

export function MateOrb({ className, working = false, label }: Props) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn("relative inline-block size-4 shrink-0", className)}
      data-mate-orb=""
      data-working={working ? "" : undefined}
      role={label ? "img" : undefined}
    >
      <span className="mate-orb-ring absolute inset-0 rounded-full" />

      <span className="mate-orb-body absolute inset-[12.5%] rounded-full" />

      <span className="mate-orb-shine absolute top-[28%] left-[26.5%] h-[15.6%] w-[25%] rounded-full" />

      <span className="mate-orb-eye absolute top-[49%] left-[36.6%] size-[8.2%] min-h-px min-w-px rounded-full" />

      <span className="mate-orb-eye absolute top-[49%] left-[55.3%] size-[8.2%] min-h-px min-w-px rounded-full" />
    </span>
  );
}
