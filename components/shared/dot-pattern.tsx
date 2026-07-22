import { cn } from "@/core/utils/cn";

type Props = {
  className?: string;
};

export function DotPattern({ className }: Props) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 opacity-[0.08]", className)}
      style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
        backgroundSize: "24px 24px",
      }}
    />
  );
}
