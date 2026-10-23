import type { CSSProperties } from "react";

import { Fragment } from "react";

import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";
import { cn } from "@/core/utils/cn";

type SkeletonNode = { x: number; y: number; rows: number };

export const CONFIGURE_GRAPH_SKELETON_NODES: readonly SkeletonNode[] = [
  { x: 17, y: 34, rows: 4 },
  { x: 50, y: 20, rows: 5 },
  { x: 83, y: 38, rows: 3 },
  { x: 33, y: 76, rows: 3 },
  { x: 68, y: 74, rows: 4 },
];

export const CONFIGURE_GRAPH_SKELETON_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [3, 4],
  [2, 4],
];

const STACKED_NODES = 3;

const ROW_WIDTHS = ["w-28", "w-20", "w-32", "w-24", "w-16"];

type CardProps = { animated: boolean; group: number; rows: number; className?: string; style?: CSSProperties };

function SkeletonNodeCard({ animated, group, rows, className, style }: CardProps) {
  return (
    <div
      className={cn("w-[22rem] rounded-xl border border-border bg-card shadow-sm", className)}
      data-configure-graph-skeleton-node=""
      data-skeleton-group={Math.min(group, 3)}
      style={style}
    >
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
        <Shape animated={animated} className="size-4 shrink-0 rounded-sm" />

        <Shape breathe animated={animated} className="h-4 w-32" motionPhase={1} />

        <Shape animated={animated} className="ms-auto h-3.5 w-12" motionPhase={1} />
      </div>

      <div className="border-t border-border py-1">
        {ROW_WIDTHS.slice(0, rows).map((width) => (
          <div key={width} className="flex h-9 items-center gap-2.5 px-3.5">
            <span className="size-4 shrink-0" />

            <Shape animated={animated} className={cn("h-3.5", width)} motionPhase={2} />

            <Shape animated={animated} className="ms-auto h-3.5 w-14" motionPhase={2} />
          </div>
        ))}
      </div>

      <div className="border-t border-border py-2 ps-10 pe-3.5">
        <Shape animated={animated} className="h-3.5 w-20" motionPhase={3} />
      </div>
    </div>
  );
}

function SkeletonEdge({ from, to }: { from?: SkeletonNode; to?: SkeletonNode }) {
  if (!from || !to) return null;
  const down = to.y > from.y;
  const right = to.x > from.x;
  return (
    <span
      className={cn(
        "absolute border-muted-foreground/30",
        down ? "border-t-[1.5px]" : "border-b-[1.5px]",
        right ? "border-r-[1.5px]" : "border-l-[1.5px]",
        down && right && "rounded-tr-2xl",
        down && !right && "rounded-tl-2xl",
        !down && right && "rounded-br-2xl",
        !down && !right && "rounded-bl-2xl",
      )}
      data-configure-graph-skeleton-edge=""
      style={{
        left: `${Math.min(from.x, to.x)}%`,
        top: `${Math.min(from.y, to.y)}%`,
        width: `${Math.abs(to.x - from.x)}%`,
        height: `${Math.abs(to.y - from.y)}%`,
      }}
    />
  );
}

export function ConfigureGraphSkeleton({ animated = true, className }: { animated?: boolean; className?: string }) {
  const nodes = CONFIGURE_GRAPH_SKELETON_NODES;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative size-full min-h-0 overflow-hidden bg-background bg-[radial-gradient(circle,var(--border)_0.75px,transparent_1px)] bg-size-[18px_18px]",
        className,
      )}
      data-configure-graph-skeleton=""
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
    >
      <div className="absolute inset-0 hidden lg:block">
        {CONFIGURE_GRAPH_SKELETON_EDGES.map(([from, to]) => (
          <SkeletonEdge key={`${from}-${to}`} from={nodes[from]} to={nodes[to]} />
        ))}

        {nodes.map((node, index) => (
          <SkeletonNodeCard
            key={`${node.x}-${node.y}`}
            animated={animated}
            className="absolute -translate-1/2 scale-[0.6] xl:scale-[0.7] 2xl:scale-[0.85]"
            group={index}
            rows={node.rows}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
          />
        ))}
      </div>

      <div className="flex flex-col items-center px-4 py-6 lg:hidden">
        {nodes.slice(0, STACKED_NODES).map((node, index) => (
          <Fragment key={`${node.x}-${node.y}`}>
            {index > 0 && <span className="h-6 w-px bg-muted-foreground/30" />}

            <SkeletonNodeCard
              animated={animated}
              className="w-full max-w-[22rem]"
              group={index}
              rows={Math.min(node.rows, 3)}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
