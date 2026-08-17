import { cn } from "@/core/utils/cn";

export type SkeletonTone = "placeholder" | "current";

const TONE_CLASS: Record<SkeletonTone, string> = {
  placeholder: "bg-placeholder",
  current: "bg-current/40",
};

type Props = React.ComponentProps<"div"> & {
  animated?: boolean;
  tone?: SkeletonTone;
};

function Skeleton({ animated = true, className, tone = "placeholder", ...props }: Props) {
  return (
    <div
      className={cn("rounded-md", TONE_CLASS[tone], animated && "animate-pulse motion-reduce:animate-none", className)}
      data-slot="skeleton"
      data-tone={tone}
      {...props}
    />
  );
}

export { Skeleton };
