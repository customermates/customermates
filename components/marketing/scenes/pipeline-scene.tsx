import { SceneCursor, type CursorWaypoint } from "./scene-cursor";
import { SceneFrame, SceneWindow, sceneAfter, type SceneBeats, type SceneProps } from "./scene-grammar";
import {
  AppChip,
  Avatar,
  Card,
  CardContent,
  DATA_KANBAN_CARDS_CLASS_NAME,
  DATA_KANBAN_COLUMN_CLASS_NAME,
  DATA_KANBAN_HEADER_CLASS_NAME,
  DATA_KANBAN_ROOT_CLASS_NAME,
  DATA_KANBAN_TRACK_CLASS_NAME,
  OverlappingStack,
} from "./platform";

import { cn } from "@/core/utils/cn";

const OWNERS = {
  jonas: { name: "Jonas Weber", photo: "/demo/avatars/photos/jonas-weber.png" },
  max: { name: "Max Bergmann", photo: "/demo/avatars/photos/max-bergmann.png" },
};

const STAGES = [
  { key: "demo", label: "Demo", variant: "info", weight: 40 },
  { key: "proposal", label: "Proposal", variant: "warning", weight: 60 },
  { key: "negotiation", label: "Negotiation", variant: "warning", weight: 80 },
] as const;

const DEALS = [
  { id: "dcp", name: "Digital Customer Platform", org: "BMW", value: 198_500, owner: OWNERS.max, home: "demo" },
  {
    id: "pap",
    name: "Process Automation Program",
    org: "Deutsche Post",
    value: 120_000,
    owner: OWNERS.jonas,
    home: "demo",
  },
  {
    id: "eip",
    name: "Enterprise Integration Program",
    org: "ASML",
    value: 212_000,
    owner: OWNERS.max,
    home: "proposal",
  },
  {
    id: "crm",
    name: "CRM Rollout & Sales Enablement",
    org: "Roche",
    value: 124_000,
    owner: OWNERS.jonas,
    home: "negotiation",
  },
] as const;

const CARRIED = "pap";

export const PIPELINE_BEATS = {
  reach: [0.06, 0.2],
  lift: [0.2, 0.23],
  carry: [0.23, 0.42],
  drop: [0.42, 0.44],
  hold: [0.44, 0.62],
  liftBack: [0.62, 0.65],
  carryBack: [0.65, 0.84],
  settle: [0.84, 0.92],
} as const satisfies SceneBeats;

export const PIPELINE_DURATION_MS = 12_000;

export const PIPELINE_STILL_AT = 0.52;

const CURSOR_IDLE = { x: 8, y: 96 } as const;

const CURSOR_HOME = { x: 25, y: 61 } as const;

const CURSOR_SLOT = { x: 72.5, y: 61 } as const;

const CARRY_PX = 608;

const CURSOR_PATH: readonly CursorWaypoint[] = [
  { at: 0, ...CURSOR_IDLE },
  { at: 0.06, ...CURSOR_IDLE },
  { at: 0.2, ...CURSOR_HOME },
  { at: 0.23, holding: true, ...CURSOR_HOME },
  { at: 0.42, ...CURSOR_SLOT },
  { at: 0.62, ...CURSOR_SLOT },
  { at: 0.65, holding: true, ...CURSOR_SLOT },
  { at: 0.84, ...CURSOR_HOME },
  { at: 0.92, ...CURSOR_IDLE },
  { at: 1, ...CURSOR_IDLE },
];

const money = (amount: number, digits: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "EUR",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  }).format(amount);

function carryOffset(clock: number) {
  const outbound = clock >= PIPELINE_BEATS.lift[1] && clock < PIPELINE_BEATS.drop[0];
  const inbound = clock >= PIPELINE_BEATS.liftBack[1] && clock < PIPELINE_BEATS.settle[0];
  if (!outbound && !inbound) return null;

  const [from, to] = outbound
    ? [PIPELINE_BEATS.lift[1], PIPELINE_BEATS.drop[0]]
    : [PIPELINE_BEATS.liftBack[1], PIPELINE_BEATS.settle[0]];
  const progress = (clock - from) / (to - from);
  const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
  return outbound ? eased * CARRY_PX : -eased * CARRY_PX;
}

export function PipelineScene({ className, film, label, t }: SceneProps) {
  const clock = typeof t === "number" ? t : PIPELINE_STILL_AT;
  const landed = sceneAfter(clock, PIPELINE_BEATS.drop[0]) && !sceneAfter(clock, PIPELINE_BEATS.settle[0]);
  const offset = typeof t === "number" ? carryOffset(clock) : null;

  const stageOf = (deal: (typeof DEALS)[number]) => (deal.id === CARRIED && landed ? "proposal" : deal.home);

  return (
    <SceneFrame className={className} crop={film ? "none" : "bottom-right"} film={film} label={label}>
      <SceneWindow fill={film} title="Deals · Board">
        <div className={cn(DATA_KANBAN_ROOT_CLASS_NAME, film && "min-h-0 flex-1")}>
          <div className={DATA_KANBAN_TRACK_CLASS_NAME}>
            {STAGES.map((stage) => {
              const cards = DEALS.filter((deal) => stageOf(deal) === stage.key)
                .slice()
                .sort((left, right) => Number(left.id === CARRIED) - Number(right.id === CARRIED));
              const total = cards.reduce((sum, deal) => sum + deal.value, 0);

              return (
                <div key={stage.key} className={DATA_KANBAN_COLUMN_CLASS_NAME}>
                  <div className={DATA_KANBAN_HEADER_CLASS_NAME}>
                    <AppChip size="sm" variant={stage.variant}>
                      {stage.label}
                    </AppChip>

                    <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      {cards.length}
                    </span>

                    <span className="text-xs text-muted-foreground tabular-nums">{stage.weight}%</span>

                    <span className="ml-auto flex min-w-0 shrink items-baseline gap-1 text-xs text-muted-foreground tabular-nums">
                      <span className="truncate opacity-65">{money(total, 0)}</span>

                      <span className="shrink-0 opacity-50">→</span>

                      <span className="truncate text-foreground">{money((total * stage.weight) / 100, 0)}</span>
                    </span>
                  </div>

                  <div className={DATA_KANBAN_CARDS_CLASS_NAME}>
                    {cards.map((deal) => {
                      const carried = deal.id === CARRIED && offset !== null;

                      return (
                        <Card
                          key={deal.id}
                          className={cn(
                            "relative gap-2 py-3 select-none",
                            carried && "z-50 shadow-lg shadow-black/20 ring-1 ring-border/60",
                          )}
                          style={carried ? { transform: `translate3d(${offset}px, 0, 0)` } : undefined}
                        >
                          <CardContent className="px-3">
                            <div className="space-y-2">
                              <div className="text-sm font-medium">{deal.name}</div>

                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="shrink-0 text-xs text-muted-foreground">Stage</span>

                                <AppChip size="sm" variant={stage.variant}>
                                  {stage.label}
                                </AppChip>
                              </div>

                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="shrink-0 text-xs text-muted-foreground">Deal Value</span>

                                <span className="min-w-0 truncate text-right">{money(deal.value, 2)}</span>
                              </div>

                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="shrink-0 text-xs text-muted-foreground">Weighted Value</span>

                                <span className="min-w-0 truncate text-right">
                                  {money((deal.value * stage.weight) / 100, 2)}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="shrink-0 text-xs text-muted-foreground">Organizations</span>

                                <AppChip size="sm">{deal.org}</AppChip>
                              </div>

                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="shrink-0 text-xs text-muted-foreground">Assigned</span>

                                <OverlappingStack
                                  badgeKey={(owner) => owner.name}
                                  badges={[deal.owner]}
                                  renderBadge={(owner) => <Avatar name={owner.name} src={owner.photo} />}
                                  renderOverflow={(count) => <Avatar fallback={`+${count}`} />}
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SceneWindow>

      <SceneCursor path={CURSOR_PATH} t={t} />
    </SceneFrame>
  );
}
