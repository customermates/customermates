import Image from "next/image";

import { cn } from "@/lib/utils";

type Variant = "wave-1" | "wave-2" | "elements";

type Props = {
  variant?: Variant;
  className?: string;
  opacity?: number;
};

const DIMENSIONS: Record<Variant, { src: string; width: number; height: number }> = {
  "wave-1": { src: "/decorations/wave-1.svg", width: 1080, height: 757 },
  "wave-2": { src: "/decorations/wave-2.svg", width: 1080, height: 757 },
  elements: { src: "/decorations/elements.svg", width: 1081, height: 1043 },
};

export function WaveDecoration({ variant = "wave-1", className, opacity = 0.6 }: Props) {
  const { src, width, height } = DIMENSIONS[variant];

  return (
    <div aria-hidden className={cn("pointer-events-none absolute select-none", className)} style={{ opacity }}>
      <Image priority alt="" className="size-full" fetchPriority="high" height={height} src={src} width={width} />
    </div>
  );
}
