import { SETTINGS_CARD_GRID_CLASS_NAME } from "@/components/page-state/page-state-geometry";
import { SkeletonShape as Shape, type SkeletonMotionPhase } from "@/components/page-state/skeleton-shape";

type Resource = "api-keys" | "connected-accounts";
type Props = { animated?: boolean };

const CARDS = Array.from({ length: 4 }, (_, index) => index);
const ROWS = Array.from({ length: 5 }, (_, index) => index);

function ProfileResourcePageSkeleton({ animated = true, resource }: Props & { resource: Resource }) {
  const rowCount = resource === "connected-accounts" ? 5 : 3;
  return (
    <div
      aria-hidden="true"
      className="flex size-full min-h-[32rem] max-w-3xl flex-col gap-4"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-profile-resource-page-skeleton={resource}
      data-skeleton-kind="settings"
      data-skeleton-variant={resource}
      data-skeleton-view="cards"
    >
      <div
        className="grid w-full grid-cols-[1rem_1fr] items-start gap-x-3 gap-y-0.5 rounded-lg border px-4 py-3"
        data-skeleton-group="0"
      >
        <Shape animated={animated} className="size-4" />

        <Shape breathe animated={animated} className="mt-0.5 h-3 w-4/5" motionPhase={1} />
      </div>

      <div className={SETTINGS_CARD_GRID_CLASS_NAME}>
        {CARDS.map((card) => (
          <div
            key={card}
            className="flex flex-col gap-3 rounded-xl bg-card py-4 shadow-xs"
            data-skeleton-group={card % 4}
          >
            <div className="flex flex-col gap-2 px-4">
              <div className="flex h-5 items-center gap-2">
                {resource === "connected-accounts" && <Shape animated={animated} className="size-4 shrink-0 rounded" />}

                <Shape breathe animated={animated} className="h-3 w-2/3" motionPhase={1} />
              </div>

              {ROWS.slice(0, rowCount).map((row) => {
                const motionPhase = Math.min(row + 2, 3) as SkeletonMotionPhase;
                return (
                  <div key={row} className="flex h-5 items-center justify-between gap-3">
                    <Shape animated={animated} className="h-2.5 w-20 shrink-0" motionPhase={motionPhase} />

                    <Shape animated={animated} className="h-3 w-24 max-w-[50%]" motionPhase={motionPhase} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApiKeysPageSkeleton(props: Props) {
  return <ProfileResourcePageSkeleton {...props} resource="api-keys" />;
}

export function ConnectedAccountsPageSkeleton(props: Props) {
  return <ProfileResourcePageSkeleton {...props} resource="connected-accounts" />;
}
