import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";
import { cn } from "@/core/utils/cn";

type Props = { animated?: boolean; view?: "split" | "list" | "transcript" };

const ROWS = Array.from({ length: 10 }, (_, index) => index);

function ListSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto" data-skeleton-scroll-owner="inbox-list">
      {ROWS.map((row) => (
        <div
          key={row}
          className="flex min-h-16 items-center gap-3 border-b p-3 last:border-b-0"
          data-skeleton-group={row % 4}
        >
          <Shape animated={animated} className="size-8 shrink-0 rounded-lg" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Shape breathe animated={animated} className="h-3 w-2/5" motionPhase={1} />

              <Shape animated={animated} className="h-2.5 w-12" motionPhase={2} />
            </div>

            <Shape animated={animated} className="mt-0.5 h-2.5 w-4/5" motionPhase={3} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Message({
  animated,
  outbound = false,
  height,
  group,
}: {
  animated: boolean;
  outbound?: boolean;
  height: string;
  group: 0 | 1 | 2 | 3;
}) {
  return (
    <div className={cn("flex gap-2 px-4 py-2", outbound && "flex-row-reverse")} data-skeleton-group={group}>
      <Shape animated={animated} className="size-8 shrink-0 self-end rounded-lg" />

      <Shape
        breathe
        animated={animated}
        className={cn(
          "max-w-[80%] rounded-xl shadow-xs",
          outbound ? "w-3/5 rounded-br-md" : "w-2/3 rounded-bl-md",
          height,
        )}
        motionPhase={1}
      />
    </div>
  );
}

function TranscriptSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        className="flex flex-1 flex-col justify-end gap-1 overflow-y-auto py-3"
        data-skeleton-scroll-owner="transcript"
      >
        <Message animated={animated} group={0} height="h-16" />

        <Message outbound animated={animated} group={1} height="h-20" />

        <Message animated={animated} group={2} height="h-12" />
      </div>

      <div className="shrink-0 bg-background px-4 pt-2 pb-4">
        <div
          className="flex min-h-[6rem] flex-col justify-between rounded-xl bg-card p-3 shadow-xs"
          data-skeleton-group="3"
        >
          <Shape breathe animated={animated} className="h-3 w-2/3" />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Shape animated={animated} className="size-8 rounded-md" motionPhase={1} />

              <Shape animated={animated} className="size-8 rounded-md" motionPhase={2} />
            </div>

            <Shape animated={animated} className="h-8 w-20 rounded-md" motionPhase={3} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function InboxPageSkeleton({ animated = true, view = "split" }: Props) {
  const content =
    view === "list" ? (
      <ListSkeleton animated={animated} />
    ) : view === "transcript" ? (
      <TranscriptSkeleton animated={animated} />
    ) : (
      <div className="flex h-full min-h-0 min-w-0 flex-1 lg:grid lg:grid-cols-[380px_1fr]">
        <div className="min-h-0 min-w-0 flex-1 lg:border-r lg:border-border">
          <ListSkeleton animated={animated} />
        </div>

        <div className="hidden min-h-0 min-w-0 flex-1 lg:block">
          <TranscriptSkeleton animated={animated} />
        </div>
      </div>
    );
  return (
    <div
      data-inbox-page-skeleton
      aria-hidden="true"
      className="size-full min-h-0"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="inbox"
      data-skeleton-view={view}
    >
      {content}
    </div>
  );
}
