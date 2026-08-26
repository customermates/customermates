import {
  VISUAL_AGENT_PROVIDER_FIXTURES,
  VISUAL_PROVIDER_PERSON_PAIRINGS,
  VISUAL_RECORD_ASSIGNEE_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  VISUAL_STATUS_FIXTURES,
  type VisualAgentProviderFixtureId,
  type VisualStatusFixtureId,
} from "@/components/marketing/visuals/native-fixtures";
import { visualSourceChecksum } from "@/components/marketing/visuals/visual-contract";

export const MOTION_FRAME_SEQUENCE = ["opening", "focal", "resolved"] as const;

export const SEEDED_DEAL_STATUS_FIXTURES = ["deal-open", "deal-won", "deal-lost", "deal-abandoned"] as const;
export const SEEDED_DEAL_STATUSES = SEEDED_DEAL_STATUS_FIXTURES.map((status) => VISUAL_STATUS_FIXTURES[status].label);
export const DEAL_OVERVIEW_STATUS_FIXTURES = ["deal-open", "deal-won", "deal-lost"] as const;
export const DEAL_OVERVIEW_EXCLUDED_STATUS_FIXTURES = ["deal-abandoned"] as const;
export const DEAL_OVERVIEW_STATUS_COUNTS = {
  "deal-lost": 2,
  "deal-open": 3,
  "deal-won": 4,
} as const satisfies Record<(typeof DEAL_OVERVIEW_STATUS_FIXTURES)[number], number>;
export const DEAL_OVERVIEW_TOTAL_VALUES = {
  "deal-lost": 538_500,
  "deal-open": 725_500,
  "deal-won": 545_500,
} as const satisfies Record<(typeof DEAL_OVERVIEW_STATUS_FIXTURES)[number], number>;

export type MotionFramePhase = (typeof MOTION_FRAME_SEQUENCE)[number];

export type MotionCursor = "none" | "causal-human";

type MotionFrame = {
  cursor: MotionCursor;
  phase: MotionFramePhase;
  state: string;
};

type MotionJourney = {
  change: string;
  origin: string;
  result: string;
};

type MotionStoryboardBase = {
  actor: "system-event" | "external-client" | "human-cursor";
  description: string;
  frames: readonly [MotionFrame, MotionFrame, MotionFrame];
  id: "unified-inbox" | "agent-pipeline" | "dashboard-insight";
  journeys: readonly [MotionJourney];
  sourceFacts: readonly string[];
  title: string;
};

export type InboxStoryboard = MotionStoryboardBase & {
  activeProvider: "gmail";
  channels: readonly [
    { person: "anna-mueller"; provider: "gmail" },
    { person: "leon-becker"; provider: "linkedin" },
    { person: "sophie-wagner"; provider: "whatsapp" },
  ];
  contact: {
    detail: "Program Manager at Roche";
    entity: "Contact";
    person: "anna-mueller";
  };
  kind: "inbox";
  thread: {
    preview: "The invite is in and both pilot owners confirmed.";
    state: "open";
    subject: "Next steps for the Roche rollout";
  };
};

export type PipelineStoryboard = MotionStoryboardBase & {
  agentProvider: VisualAgentProviderFixtureId;
  assignedUser: "max-bergmann";
  field: "Status";
  instruction: "Set Status to Won";
  kind: "pipeline";
  record: "deal-data-analytics";
  statusChange: {
    from: VisualStatusFixtureId;
    to: VisualStatusFixtureId;
  };
};

export type DashboardStoryboard = MotionStoryboardBase & {
  currency: "EUR";
  kind: "dashboard";
  purpose: "inspection";
  quantityEncoding: "one-token-per-deal";
  selectedSegment: "deal-won";
  segments: readonly [
    { count: 3; status: "deal-open"; totalValue: 725_500 },
    { count: 4; status: "deal-won"; totalValue: 545_500 },
    { count: 2; status: "deal-lost"; totalValue: 538_500 },
  ];
  valueDisclosure: "selected-total-only";
  widget: "Deal Overview";
};

export type MotionStoryboard = InboxStoryboard | PipelineStoryboard | DashboardStoryboard;

export type MotionStoryboardApproval =
  | { checksum: null; status: "pending" }
  | { checksum: `fnv1a-${string}`; status: "keyframes-approved" };

export const MOTION_STORYBOARDS = [
  {
    activeProvider: "gmail",
    actor: "system-event",
    channels: [
      { person: "anna-mueller", provider: "gmail" },
      { person: "leon-becker", provider: "linkedin" },
      { person: "sophie-wagner", provider: "whatsapp" },
    ],
    contact: {
      detail: "Program Manager at Roche",
      entity: "Contact",
      person: "anna-mueller",
    },
    description:
      "Gmail, LinkedIn, and WhatsApp establish native multi-provider context. One incoming Gmail message from Anna Müller resolves to her existing Contact while the other sources stay quiet.",
    frames: [
      {
        cursor: "none",
        phase: "opening",
        state: "Three seeded provider-and-person sources rest quietly around Anna Müller's Contact.",
      },
      {
        cursor: "none",
        phase: "focal",
        state: "Anna's open Gmail thread becomes the sole active item as one solid line reaches the Contact border.",
      },
      {
        cursor: "none",
        phase: "resolved",
        state: "The existing Contact match is clear; LinkedIn and WhatsApp remain subdued, unconnected context.",
      },
    ],
    id: "unified-inbox",
    journeys: [
      {
        change: "One incoming Gmail message becomes active and reveals its existing Contact match.",
        origin: "Three quiet seeded conversations surround Anna Müller's Contact.",
        result: "Anna's Gmail thread resolves to Anna Müller without implying another relationship.",
      },
    ],
    kind: "inbox",
    sourceFacts: [
      "ee/messaging/connect/connect-channels.ts",
      "app/[locale]/(protected)/inbox/components/thread-participants.store.ts",
      "features/messaging/activities/activity-record-chips.tsx",
      "prisma/seeds/messaging/fixtures.ts",
      "prisma/seeds/messaging/seed.ts",
      "prisma/seeds/relationships.ts",
      "prisma/seeds/contacts.ts",
      "ee/messaging/persistence/prisma-messaging.repository.ts",
    ],
    thread: {
      preview: "The invite is in and both pilot owners confirmed.",
      state: "open",
      subject: "Next steps for the Roche rollout",
    },
    title: "Unified inbox",
  },
  {
    actor: "external-client",
    agentProvider: "claude",
    description:
      "Claude requests one fixture-backed Status change. The same deal moves from its seeded Open state to the configured Won option.",
    frames: [
      {
        cursor: "none",
        phase: "opening",
        state: "The deal rests at Open while Claude names the requested Status change.",
      },
      {
        cursor: "none",
        phase: "focal",
        state: "The same deal follows one authored transit path toward Won while retaining Open in transit.",
      },
      {
        cursor: "none",
        phase: "resolved",
        state: "The deal docks at Won and the Status result becomes explicit.",
      },
    ],
    id: "agent-pipeline",
    assignedUser: "max-bergmann",
    field: "Status",
    instruction: "Set Status to Won",
    journeys: [
      {
        change: "Claude's instruction changes the deal's seeded Status from Open to Won.",
        origin: "Data & Analytics Transformation rests in Open.",
        result: "The same record resolves in Won.",
      },
    ],
    kind: "pipeline",
    record: "deal-data-analytics",
    sourceFacts: [
      "prisma/seeds/custom-fields.ts",
      "prisma/seeds/deals.ts",
      "prisma/seeds/relationships.ts",
      "prisma/seeds/members.ts",
      "features/mcp-tools/deal.mcp-tools.ts",
      "features/mcp-tools/server-instructions.ts",
      "components/data-view/data-kanban-view.tsx",
      "components/ai-connection/ai-client-logo.tsx",
    ],
    statusChange: { from: "deal-open", to: "deal-won" },
    title: "Claude updates Status",
  },
  {
    actor: "human-cursor",
    currency: "EUR",
    description:
      "A human selects the fixture-backed Won group in Deal Overview. Four discrete deal tokens lift into focus and reveal their €545,500 total value without implying progress, percentage, or a trend.",
    frames: [
      {
        cursor: "none",
        phase: "opening",
        state: "Nine fixture-backed deals rest across the Open, Won, and Lost Status groups.",
      },
      {
        cursor: "causal-human",
        phase: "focal",
        state: "The human cursor selects Won; its four deal tokens lift and reveal €545,500 in total value.",
      },
      {
        cursor: "none",
        phase: "resolved",
        state: "Won remains selected with four deals and €545,500 in total value after the cursor leaves.",
      },
    ],
    id: "dashboard-insight",
    journeys: [
      {
        change: "A human selects the fixture-backed Won group.",
        origin: "Nine fixture-backed deals rest in three discrete Status groups.",
        result: "Four Won deals and their €545,500 total value remain in focus without implying progress or a trend.",
      },
    ],
    kind: "dashboard",
    purpose: "inspection",
    quantityEncoding: "one-token-per-deal",
    segments: [
      { count: 3, status: "deal-open", totalValue: 725_500 },
      { count: 4, status: "deal-won", totalValue: 545_500 },
      { count: 2, status: "deal-lost", totalValue: 538_500 },
    ],
    selectedSegment: "deal-won",
    sourceFacts: [
      "prisma/seeds/widgets.ts",
      "prisma/seeds/deals.ts",
      "prisma/seeds/services.ts",
      "prisma/seeds/custom-fields.ts",
    ],
    title: "Dashboard insight",
    valueDisclosure: "selected-total-only",
    widget: "Deal Overview",
  },
] as const satisfies readonly MotionStoryboard[];

export const MOTION_STORYBOARD_APPROVALS = {
  "agent-pipeline": {
    checksum: "fnv1a-dbbb54da",
    status: "keyframes-approved",
  },
  "dashboard-insight": {
    checksum: "fnv1a-ff9cdf4f",
    status: "keyframes-approved",
  },
  "unified-inbox": {
    checksum: "fnv1a-30571271",
    status: "keyframes-approved",
  },
} as const satisfies Record<MotionStoryboard["id"], MotionStoryboardApproval>;

export const MOTION_CONTRACT = [
  "Let the story choose a duration between 7 and 12 seconds.",
  "Render at 24 or 30 frames per second according to the choreography.",
  "Show a cursor only when a causal human action changes the state.",
  "Export silently and declare an explicit poster from the resolved frame.",
  "Hold the resolved state for at least 1.5 seconds.",
  "Reverse only reversible actions; dissolve, crop, or reset irreversible actions offscreen.",
  "Never visibly undo a send or another irreversible event.",
  "Derive light, dark, and localized output from the same authored source.",
] as const;

export const TRANSITION_CAPTURE_GATE = {
  adoption:
    "Unified inbox, Agent pipeline, and Dashboard insight each use a normalized-time benchmark source. Retained legacy scene files stay unchanged and the review exports remain outside public routes.",
  inside:
    "Inside a declared transition window, apply a template-specific progression check instead of rejecting intentional large movement.",
  outside: "Outside declared transition windows, keep the adjacent-frame SSIM floor at 0.95.",
  proof:
    "A planted smooth transition passes while an accidental one-frame cut and any cut outside a declared window fail.",
  retained: [
    "deterministic frames",
    "loop closure of at least 0.97",
    "successful decode",
    "file weight of at most 1 MB",
    "resolved hold",
  ],
} as const;

export function motionStoryboardViolations(storyboard: MotionStoryboard): string[] {
  const violations: string[] = [];
  const phases = storyboard.frames.map(({ phase }) => phase);

  if (phases.join("|") !== MOTION_FRAME_SEQUENCE.join("|"))
    violations.push("storyboards require opening, focal, and resolved frames in that order");

  if (storyboard.journeys.length !== 1) violations.push("storyboards require exactly one journey");

  const causalFrames = storyboard.frames.filter(({ cursor }) => cursor === "causal-human");

  if (storyboard.actor === "human-cursor" && causalFrames.length !== 1)
    violations.push("a human-cursor storyboard requires exactly one causal cursor frame");

  if (storyboard.actor !== "human-cursor" && causalFrames.length > 0)
    violations.push("a cursor cannot act in a system or external-client journey");

  if (storyboard.kind === "inbox") {
    const activeChannel = storyboard.channels.find(({ provider }) => provider === storyboard.activeProvider);
    if (!activeChannel || activeChannel.person !== storyboard.contact.person)
      violations.push("the active inbox source must match the resolved Contact person");

    if (storyboard.contact.entity !== "Contact")
      violations.push("the inbox relationship must resolve to a fixture-backed Contact");

    if (storyboard.thread.state !== "open") violations.push("the seeded Anna Müller Gmail thread must remain open");

    for (const channel of storyboard.channels) {
      const permittedPeople = VISUAL_PROVIDER_PERSON_PAIRINGS[channel.provider];
      if (!permittedPeople?.includes(channel.person))
        violations.push("inbox provider and person pairings must come from the seeded messaging fixtures");
    }
  }

  if (storyboard.kind === "pipeline") {
    const { from, to } = storyboard.statusChange;
    const agentProvider = VISUAL_AGENT_PROVIDER_FIXTURES[storyboard.agentProvider];
    if (!agentProvider) violations.push("pipeline agent providers must use an approved native identity");
    else {
      const authoredCopy = [
        storyboard.title,
        storyboard.description,
        ...storyboard.frames.map(({ state }) => state),
        ...storyboard.journeys.flatMap(({ change, origin, result }) => [change, origin, result]),
      ].join(" ");
      if (!authoredCopy.includes(agentProvider.name))
        violations.push("pipeline copy must name the selected agent provider");
    }

    if (!SEEDED_DEAL_STATUS_FIXTURES.includes(from) || !SEEDED_DEAL_STATUS_FIXTURES.includes(to))
      violations.push("pipeline status labels must come from the seeded deal Status model");

    if (from !== VISUAL_RECORD_FIXTURES[storyboard.record].status)
      violations.push("pipeline origin must match the seeded record Status");

    if (from === to) violations.push("pipeline origin and destination must be different Status options");

    if (storyboard.field !== "Status") violations.push("pipeline changes must name the fixture-backed Status field");

    if (storyboard.assignedUser !== VISUAL_RECORD_ASSIGNEE_FIXTURES[storyboard.record])
      violations.push("pipeline assigned user must match the seeded deal-user fixture");
  }

  if (storyboard.kind === "dashboard") {
    if (storyboard.purpose !== "inspection") violations.push("dashboard storyboards may depict inspection only");

    if (storyboard.quantityEncoding !== "one-token-per-deal")
      violations.push("dashboard quantities must use one discrete token per fixture-backed deal");

    if (storyboard.valueDisclosure !== "selected-total-only")
      violations.push("dashboard value detail must be disclosed for the selected Status group only");

    if (storyboard.currency !== "EUR")
      violations.push("dashboard fixture totals must retain their seeded EUR currency");

    if (!storyboard.segments.some(({ status }) => status === storyboard.selectedSegment))
      violations.push("dashboard selected segment must exist in the rendered distribution");

    if (storyboard.segments.some(({ count }) => !Number.isInteger(count) || count < 1))
      violations.push("dashboard token counts must be positive whole fixture counts");

    if (storyboard.segments.some(({ totalValue }) => !Number.isFinite(totalValue) || totalValue <= 0))
      violations.push("dashboard total values must be positive finite fixture amounts");

    if (storyboard.segments.some((segment) => "weightedValue" in segment))
      violations.push("dashboard inspection exposes selected total value only");

    const statuses = storyboard.segments.map(({ status }) => status) as readonly VisualStatusFixtureId[];
    if (
      statuses.length !== DEAL_OVERVIEW_STATUS_FIXTURES.length ||
      DEAL_OVERVIEW_STATUS_FIXTURES.some(
        (requiredStatus) => statuses.filter((status) => status === requiredStatus).length !== 1,
      )
    )
      violations.push("dashboard segments must contain each Deal Overview Status exactly once");

    if (
      storyboard.segments.some(({ count, status }) => {
        const expected = DEAL_OVERVIEW_STATUS_COUNTS[status];
        return count !== expected;
      })
    )
      violations.push("dashboard token counts must match the checked-in Deal Overview fixtures");

    if (
      storyboard.segments.some(({ status, totalValue }) => {
        const expected = DEAL_OVERVIEW_TOTAL_VALUES[status];
        return totalValue !== expected;
      })
    )
      violations.push("dashboard total values must match the checked-in deal and service fixtures");

    if (
      statuses.some((status) =>
        DEAL_OVERVIEW_EXCLUDED_STATUS_FIXTURES.some((excludedStatus) => excludedStatus === status),
      )
    )
      violations.push("dashboard segments must apply the Deal Overview widget filter");
  }

  return violations;
}

export function motionStoryboardApprovalViolations(
  storyboard: MotionStoryboard,
  approval: MotionStoryboardApproval | undefined,
): string[] {
  if (!approval) return ["storyboard keyframes require an explicit approval record"];
  if (approval.status !== "keyframes-approved") return ["storyboard approval must be scoped to the reviewed keyframes"];

  const checksum = visualSourceChecksum(storyboard.id, JSON.stringify(storyboard));
  if (approval.checksum !== checksum) return [`approved storyboard checksum is stale; expected ${checksum}`];

  return [];
}

for (const storyboard of MOTION_STORYBOARDS) {
  const violations = [
    ...motionStoryboardViolations(storyboard),
    ...motionStoryboardApprovalViolations(storyboard, MOTION_STORYBOARD_APPROVALS[storyboard.id]),
  ];
  if (violations.length > 0) throw new Error(`${storyboard.id}: ${violations.join("; ")}`);
}
