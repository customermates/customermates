import { cn } from "@/core/utils/cn";

export type SkeletonTone = "placeholder" | "current";

type Props = React.ComponentProps<"div"> & {
  animated?: boolean;
  tone?: SkeletonTone;
};

function Skeleton({ animated = true, className, tone = "placeholder", ...props }: Props) {
  return (
    <div
      className={cn(
        "rounded-md",
        tone === "current" ? "bg-current/40" : "bg-placeholder",
        animated && "animate-pulse motion-reduce:animate-none",
        className,
      )}
      data-slot="skeleton"
      data-tone={tone}
      {...props}
    />
  );
}

export { Skeleton };
