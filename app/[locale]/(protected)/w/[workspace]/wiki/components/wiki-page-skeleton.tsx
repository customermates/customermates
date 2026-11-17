import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

type Props = {
  animated?: boolean;
};

const DOTS = [
  "top-[22%] left-[18%] size-4",
  "top-[36%] left-[41%] size-6",
  "top-[18%] left-[63%] size-3",
  "top-[52%] left-[27%] size-3",
  "top-[58%] left-[56%] size-5",
  "top-[44%] left-[78%] size-4",
  "top-[74%] left-[40%] size-3",
  "top-[70%] left-[70%] size-3",
];

export function WikiPageSkeleton({ animated = true }: Props) {
  return (
    <div className="relative h-full min-h-80 overflow-hidden">
      <div className="flex gap-1 p-3">
        <Shape animated={animated} className="h-7 w-24 rounded-full" />

        <Shape animated={animated} className="h-7 w-28 rounded-full" motionPhase={1} />

        <Shape animated={animated} className="h-7 w-24 rounded-full" motionPhase={2} />
      </div>

      {DOTS.map((position, index) => (
        <Shape
          key={position}
          animated={animated}
          className={`absolute rounded-full ${position}`}
          motionPhase={((index % 3) + 1) as 1 | 2 | 3}
        />
      ))}
    </div>
  );
}
