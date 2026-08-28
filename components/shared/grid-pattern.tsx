import { cn } from "@/core/utils/cn";

type Props = {
  className?: string;
  density?: "compact" | "standard";
  fade?: "bottom" | "radial";
};

const DENSITY = {
  compact: "[background-size:28px_28px]",
  standard: "[background-size:56px_56px]",
} as const;

const FADE = {
  bottom: "[mask-image:linear-gradient(to_bottom,black_0%,black_38%,transparent_94%)]",
  radial: "[mask-image:radial-gradient(ellipse_82%_80%_at_50%_50%,black_30%,transparent_92%)]",
} as const;

export function GridPattern({ className, density = "standard", fade = "radial" }: Props) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)]",
        DENSITY[density],
        FADE[fade],
        className,
      )}
    />
  );
}
