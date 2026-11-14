import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

type Props = { animated?: boolean };

const CARDS = Array.from({ length: 3 }, (_, index) => index);

export function IncomingWebhooksPageSkeleton({ animated = true }: Props) {
  return (
    <div
      aria-hidden="true"
      className="flex size-full min-h-[32rem] flex-col gap-4 p-4 md:p-6"
      data-incoming-webhooks-page-skeleton="true"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="settings"
      data-skeleton-variant="incoming-webhooks"
      data-skeleton-view="cards"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Shape animated={animated} className="h-5 w-48" />

          <Shape breathe animated={animated} className="h-3 w-full max-w-md" motionPhase={1} />
        </div>

        <Shape animated={animated} className="h-9 w-44 rounded-md" motionPhase={1} />
      </div>

      <div className="flex flex-col gap-3">
        {CARDS.map((card) => (
          <div
            key={card}
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
            data-skeleton-group={card}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Shape animated={animated} className="h-3 w-40" motionPhase={2} />

                <Shape animated={animated} className="h-2.5 w-56 max-w-full" motionPhase={3} />
              </div>

              <Shape animated={animated} className="h-5 w-9 shrink-0 rounded-full" motionPhase={2} />
            </div>

            <Shape animated={animated} className="h-8 w-full rounded-md" motionPhase={3} />
          </div>
        ))}
      </div>
    </div>
  );
}
