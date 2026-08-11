import { cn } from "@/core/utils/cn";

type Props = React.ComponentProps<"div"> & {
  animated?: boolean;
};

function Skeleton({ animated = true, className, ...props }: Props) {
  return (
    <div
      className={cn("rounded-md bg-placeholder", animated && "animate-pulse motion-reduce:animate-none", className)}
      data-slot="skeleton"
      {...props}
    />
  );
}

export { Skeleton };
