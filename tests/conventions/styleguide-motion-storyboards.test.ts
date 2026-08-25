import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DEAL_OVERVIEW_EXCLUDED_STATUS_FIXTURES,
  DEAL_OVERVIEW_STATUS_COUNTS,
  DEAL_OVERVIEW_STATUS_FIXTURES,
  DEAL_OVERVIEW_TOTAL_VALUES,
  MOTION_FRAME_SEQUENCE,
  MOTION_STORYBOARD_APPROVALS,
  MOTION_STORYBOARDS,
  SEEDED_DEAL_STATUS_FIXTURES,
  SEEDED_DEAL_STATUSES,
  motionStoryboardApprovalViolations,
  motionStoryboardViolations,
  type MotionStoryboard,
} from "@/app/[locale]/(static)/styleguide/components/motion-storyboards.data";
import { MotionStoryboards } from "@/app/[locale]/(static)/styleguide/components/motion-storyboards";
import {
  VISUAL_AGENT_PROVIDER_FIXTURES,
  VISUAL_PERSON_FIXTURES,
  VISUAL_PROVIDER_PERSON_PAIRINGS,
  VISUAL_RECORD_ASSIGNEE_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  VISUAL_STATUS_FIXTURES,
} from "@/components/marketing/visuals/native-fixtures";
import {
  AGENT_PIPELINE_STORYBOARD_LAYOUT,
  UNIFIED_INBOX_STORYBOARD_LAYOUT,
  trimAuthoredConnector,
} from "@/components/marketing/visuals/story-visual-layout";
import {
  SYNTHETIC_DEAL_STATUS_INDEXES,
  SYNTHETIC_SERVICE_DEAL_LINKS,
} from "@/prisma/seeds/deals";
import { SYNTHETIC_SERVICE_AMOUNTS } from "@/prisma/seeds/services";

import { REPO_ROOT } from "./walk";

const COMPONENT = join(
  REPO_ROOT,
  "app",
  "[locale]",
  "(static)",
  "styleguide",
  "components",
  "motion-storyboards.tsx",
);

function storyboard(kind: MotionStoryboard["kind"]): MotionStoryboard {
  const match = MOTION_STORYBOARDS.find((candidate) => candidate.kind === kind);
  if (!match) throw new Error(`missing ${kind} storyboard`);
  return match;
}

describe("style guide motion storyboards", () => {
  it("renders exactly three journeys with opening, focal, and resolved keyframes", () => {
    expect(MOTION_STORYBOARDS).toHaveLength(3);

    for (const candidate of MOTION_STORYBOARDS) {
      expect(candidate.journeys).toHaveLength(1);
      expect(candidate.frames.map(({ phase }) => phase)).toEqual(
        MOTION_FRAME_SEQUENCE,
      );
      expect(motionStoryboardViolations(candidate)).toEqual([]);
    }
  });

  it("locks the human-approved keyframes to their exact storyboard content", () => {
    expect(Object.keys(MOTION_STORYBOARD_APPROVALS).sort()).toEqual(
      MOTION_STORYBOARDS.map(({ id }) => id).sort(),
    );

    for (const candidate of MOTION_STORYBOARDS) {
      const approval = MOTION_STORYBOARD_APPROVALS[candidate.id];
      expect(approval.status).toBe("keyframes-approved");
      expect(motionStoryboardApprovalViolations(candidate, approval)).toEqual(
        [],
      );
    }
  });

  it("derives German visual labels and keyframe states without English fallback", () => {
    const markup = renderToStaticMarkup(
      createElement(MotionStoryboards, { locale: "de" }),
    );

    expect(markup).toContain("Programmmanagerin bei Roche");
    expect(markup).toContain("Nächste Schritte für den Roche-Rollout");
    expect(markup).toContain("Status auf Won setzen");
    expect(markup).toContain("Zugewiesene Person");
    expect(markup).toContain("Deal-Übersicht");
    expect(markup).toContain("545.500");
    expect(markup).toContain("Annas offene Gmail-Unterhaltung");
    expect(markup).not.toContain("Program Manager at Roche");
    expect(markup).not.toContain("Next steps for the Roche rollout");
    expect(markup).not.toContain(">Set Status to Won<");
    expect(markup).not.toContain(">Assigned user<");
  });

  it("uses a cursor only for the dashboard's single causal human action", () => {
    const inbox = storyboard("inbox");
    const pipeline = storyboard("pipeline");
    const dashboard = storyboard("dashboard");

    expect(inbox.frames.every(({ cursor }) => cursor === "none")).toBe(true);
    expect(pipeline.frames.every(({ cursor }) => cursor === "none")).toBe(true);
    expect(
      dashboard.frames
        .filter(({ cursor }) => cursor === "causal-human")
        .map(({ phase }) => phase),
    ).toEqual(["focal"]);
  });

  it("grounds the pipeline and dashboard in the checked-in synthetic fixtures", () => {
    const customFields = readFileSync(
      join(REPO_ROOT, "prisma", "seeds", "custom-fields.ts"),
      "utf8",
    );
    const deals = readFileSync(
      join(REPO_ROOT, "prisma", "seeds", "deals.ts"),
      "utf8",
    );
    const widgets = readFileSync(
      join(REPO_ROOT, "prisma", "seeds", "widgets.ts"),
      "utf8",
    );
    const statusIndexes = deals.match(
      /SYNTHETIC_DEAL_STATUS_INDEXES\s*=\s*\[([^\]]+)\]/,
    )?.[1];

    expect(customFields).toContain(
      `optionLabels: ["${SEEDED_DEAL_STATUSES.join('", "')}"]`,
    );
    expect(deals).toContain('"Data & Analytics Transformation"');
    expect(widgets).toContain('"Deal Overview"');
    expect(widgets).toContain("value: [customOptionIds.dealStatus.abandoned]");
    expect(
      statusIndexes,
      "deal seed must keep a readable Status-index fixture",
    ).toBeDefined();

    const parsedStatusIndexes =
      statusIndexes?.split(",").map((value) => Number(value.trim())) ?? [];
    expect(parsedStatusIndexes).toEqual([...SYNTHETIC_DEAL_STATUS_INDEXES]);

    const dealTotal = (dealIndex: number) =>
      SYNTHETIC_SERVICE_DEAL_LINKS.filter(
        ([linkedDealIndex]) => linkedDealIndex === dealIndex,
      ).reduce(
        (sum, [, serviceIndex, quantity]) =>
          sum + SYNTHETIC_SERVICE_AMOUNTS[serviceIndex] * quantity,
        0,
      );
    const distributions = SEEDED_DEAL_STATUS_FIXTURES.map(
      (status, statusIndex) => ({
        count: SYNTHETIC_DEAL_STATUS_INDEXES.filter(
          (index) => index === statusIndex,
        ).length,
        status,
        totalValue: SYNTHETIC_DEAL_STATUS_INDEXES.reduce<number>(
          (sum, index, dealIndex) =>
            sum + (index === statusIndex ? dealTotal(dealIndex) : 0),
          0,
        ),
      }),
    ).filter(
      ({ status }) =>
        !DEAL_OVERVIEW_EXCLUDED_STATUS_FIXTURES.some(
          (excludedStatus) => excludedStatus === status,
        ),
    );

    const dashboard = storyboard("dashboard");
    expect(dashboard.kind).toBe("dashboard");
    if (dashboard.kind !== "dashboard")
      throw new Error("expected dashboard storyboard");
    expect(dashboard.segments).toEqual(distributions);
    expect(dashboard.segments.map(({ status }) => status)).toEqual(
      DEAL_OVERVIEW_STATUS_FIXTURES,
    );
    expect(
      Object.fromEntries(
        dashboard.segments.map(({ status, totalValue }) => [
          status,
          totalValue,
        ]),
      ),
    ).toEqual(DEAL_OVERVIEW_TOTAL_VALUES);
    expect(dashboard.currency).toBe("EUR");
    expect(dashboard.valueDisclosure).toBe("selected-total-only");
    expect(dashboard.sourceFacts).toContain("prisma/seeds/services.ts");

    const pipeline = storyboard("pipeline");
    expect(pipeline.kind).toBe("pipeline");
    if (pipeline.kind !== "pipeline")
      throw new Error("expected pipeline storyboard");
    expect("owner" in pipeline).toBe(false);
    expect("viewer" in pipeline).toBe(false);
    expect(pipeline.assignedUser).toBe(
      VISUAL_RECORD_ASSIGNEE_FIXTURES[pipeline.record],
    );
    expect(pipeline.agentProvider).toBe("claude");
    expect(VISUAL_AGENT_PROVIDER_FIXTURES[pipeline.agentProvider].name).toBe(
      "Claude",
    );
    expect(pipeline.field).toBe("Status");

    const names = deals
      .match(/SYNTHETIC_DEAL_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1]
      .match(/"([^"]+)"/g);
    const record = VISUAL_RECORD_FIXTURES[pipeline.record];
    const recordIndex = names?.findIndex((name) => name === `"${record.name}"`);
    expect(recordIndex).toBeGreaterThanOrEqual(0);
    expect(pipeline.statusChange.from).toBe(
      SEEDED_DEAL_STATUS_FIXTURES[parsedStatusIndexes[recordIndex ?? -1]],
    );
    expect(pipeline.sourceFacts).toContain("prisma/seeds/members.ts");
    expect(pipeline.sourceFacts).toContain("prisma/seeds/relationships.ts");
    expect(pipeline.sourceFacts).toContain(
      "features/mcp-tools/deal.mcp-tools.ts",
    );
    expect(pipeline.sourceFacts).toContain(
      "features/mcp-tools/server-instructions.ts",
    );
    expect(
      readFileSync(join(REPO_ROOT, "prisma", "seeds", "members.ts"), "utf8"),
    ).toContain("SYNTHETIC_COMPANY_USERS.maxBergmann");
    expect(
      readFileSync(
        join(REPO_ROOT, "prisma", "seeds", "relationships.ts"),
        "utf8",
      ),
    ).toContain("Prisma.DealUserCreateManyInput");
  });

  it("grounds the Unified inbox journey in Anna Müller's seeded Gmail thread and existing Contact", () => {
    const inbox = storyboard("inbox");
    if (inbox.kind !== "inbox") throw new Error("expected inbox storyboard");

    expect(inbox.channels).toEqual([
      { person: "anna-mueller", provider: "gmail" },
      { person: "leon-becker", provider: "linkedin" },
      { person: "sophie-wagner", provider: "whatsapp" },
    ]);
    expect(inbox.contact).toEqual({
      detail: "Program Manager at Roche",
      entity: "Contact",
      person: "anna-mueller",
    });
    expect(inbox.thread).toEqual({
      preview: "The invite is in and both pilot owners confirmed.",
      state: "open",
      subject: "Next steps for the Roche rollout",
    });

    const messagingFixtures = readFileSync(
      join(REPO_ROOT, "prisma", "seeds", "messaging", "fixtures.ts"),
      "utf8",
    );
    expect(messagingFixtures).toContain('displayName: "Anna Müller"');
    expect(messagingFixtures).toContain(
      'occupation: "Program Manager at Roche"',
    );
    expect(messagingFixtures).toContain(
      'subject: "Next steps for the Roche rollout"',
    );
    expect(messagingFixtures).toContain(
      'text: "The invite is in and both pilot owners confirmed.',
    );
    expect(messagingFixtures).toContain('state: "open"');

    for (const channel of inbox.channels) {
      expect(VISUAL_PROVIDER_PERSON_PAIRINGS[channel.provider]).toContain(
        channel.person,
      );
      expect(VISUAL_PERSON_FIXTURES[channel.person].asset).toMatch(
        /^\/demo\/avatars\/photos\/.+\.png$/,
      );
    }
  });

  it("renders native provider, avatar and Status semantics in every storyboard", () => {
    const markup = renderToStaticMarkup(createElement(MotionStoryboards));

    expect(markup).toContain('data-native-provider="gmail"');
    expect(markup).toContain('data-native-provider="linkedin"');
    expect(markup).toContain('data-native-provider="whatsapp"');
    expect(markup).toContain('data-native-agent-provider="claude"');
    expect(markup).toContain('data-native-person="anna-mueller"');
    expect(markup).toContain('data-native-person="leon-becker"');
    expect(markup).toContain('data-native-person="max-bergmann"');
    expect(markup).toContain('data-native-person="sophie-wagner"');
    for (const status of DEAL_OVERVIEW_STATUS_FIXTURES) {
      const fixture = VISUAL_STATUS_FIXTURES[status];
      expect(markup).toContain(`data-native-status="${status}"`);
      expect(markup).toContain(`data-variant="${fixture.variant}"`);
    }
    expect(markup).not.toContain('data-native-status="deal-abandoned"');
  });

  it("renders stable one-token-per-deal Status groups instead of relative bars", () => {
    const markup = renderToStaticMarkup(createElement(MotionStoryboards));
    const dashboardSection = markup.split('id="dashboard-insight"')[1] ?? "";
    const componentSource = readFileSync(COMPONENT, "utf8");

    expect(
      dashboardSection.match(
        /data-dashboard-distribution="discrete-status-groups"/g,
      ),
    ).toHaveLength(3);
    expect(
      dashboardSection.match(
        /data-dashboard-quantity-encoding="one-token-per-deal"/g,
      ),
    ).toHaveLength(3);
    expect(
      dashboardSection.match(
        /data-dashboard-value-disclosure="selected-total-only"/g,
      ),
    ).toHaveLength(3);

    for (const status of DEAL_OVERVIEW_STATUS_FIXTURES) {
      const count = DEAL_OVERVIEW_STATUS_COUNTS[status];
      expect(
        dashboardSection.match(
          new RegExp(`data-dashboard-status-group="${status}"`, "g"),
        ),
      ).toHaveLength(3);
      expect(
        dashboardSection.match(
          new RegExp(`data-dashboard-token-count="${count}"`, "g"),
        ),
      ).toHaveLength(3);
      expect(
        dashboardSection.match(
          new RegExp(`data-dashboard-deal-token="${status}"`, "g"),
        ),
      ).toHaveLength(count * MOTION_FRAME_SEQUENCE.length);
    }

    expect(
      dashboardSection.match(/data-dashboard-selected="true"/g),
    ).toHaveLength(2);
    expect(
      dashboardSection.match(/data-dashboard-selected="false"/g),
    ).toHaveLength(7);
    expect(
      dashboardSection.match(
        /data-dashboard-callout="4 deals · €545,500 total value"/g,
      ),
    ).toHaveLength(2);
    expect(
      dashboardSection.match(/data-dashboard-total-value="545500"/g),
    ).toHaveLength(2);
    expect(dashboardSection.match(/>€545,500 total<\/span>/g)).toHaveLength(2);
    expect(dashboardSection).not.toContain("weighted value");
    expect(dashboardSection).not.toContain("data-dashboard-weighted-value");
    expect(
      dashboardSection.match(/data-dashboard-cursor="causal-human"/g),
    ).toHaveLength(1);
    expect(dashboardSection).not.toMatch(
      /<progress|role="progressbar"|aria-valuemax|data-dashboard-progress/,
    );
    expect(dashboardSection).not.toContain('style="width');
    expect(componentSource).not.toContain("STATUS_BAR_CLASSES");
    expect(componentSource).not.toContain("Math.max(...storyboard.segments");
  });

  it("renders one solid Gmail-to-Contact connector with exact authored border ports", () => {
    const markup = renderToStaticMarkup(createElement(MotionStoryboards));
    const unifiedSection =
      markup.split('id="unified-inbox"')[1]?.split('id="agent-pipeline"')[0] ??
      "";
    const connectorSvgs =
      unifiedSection.match(
        /<svg[^>]*data-inbox-connector="gmail-contact"[\s\S]*?<\/svg>/g,
      ) ?? [];

    expect(connectorSvgs).toHaveLength(6);
    expect(unifiedSection).not.toContain("stroke-dasharray");
    expect(unifiedSection).not.toContain("stroke-dashoffset");
    expect(unifiedSection).not.toContain("lucide-arrow-right");
    expect(unifiedSection).not.toContain("scale-105");
    expect(unifiedSection).not.toContain("attached");

    for (const placement of ["narrow", "wide"] as const) {
      const layout = UNIFIED_INBOX_STORYBOARD_LAYOUT[placement];
      const gmail = layout.sources.gmail;

      if (placement === "wide") {
        expect(layout.connector.source.x).toBe(gmail.x + gmail.width);
        expect(layout.connector.target.x).toBe(layout.contact.x);
      } else {
        expect(layout.connector.source.y).toBe(gmail.y + gmail.height);
        expect(layout.connector.target.y).toBe(layout.contact.y);
      }

      for (const phase of MOTION_FRAME_SEQUENCE) {
        const svg = connectorSvgs.find(
          (candidate) =>
            candidate.includes(`data-inbox-phase="${phase}"`) &&
            candidate.includes(`data-inbox-placement="${placement}"`),
        );
        expect(svg, `${placement} ${phase} connector`).toBeDefined();
        expect(svg).toContain(
          `data-connector-source="${layout.connector.source.x},${layout.connector.source.y}"`,
        );
        expect(svg).toContain(
          `data-connector-target="${layout.connector.target.x},${layout.connector.target.y}"`,
        );
        expect(svg).toContain('stroke-linecap="butt"');
        expect(svg).toContain('vector-effect="non-scaling-stroke"');

        const expectedDrawTarget =
          phase === "opening"
            ? layout.connector.source
            : layout.connector.target;
        const expectedProgress = phase === "opening" ? "0.000" : "1.000";
        expect(svg).toContain(
          `data-connector-draw-target="${expectedDrawTarget.x},${expectedDrawTarget.y}"`,
        );
        expect(svg).toContain(`data-motion-progress="${expectedProgress}"`);
      }
    }

    expect(unifiedSection.match(/data-inbox-source="linkedin"/g)).toHaveLength(
      6,
    );
    expect(unifiedSection.match(/data-inbox-source="whatsapp"/g)).toHaveLength(
      6,
    );
  });

  it("moves one deal along one solid Status path whose endpoint is always the card border", () => {
    const markup = renderToStaticMarkup(createElement(MotionStoryboards));
    const pipelineSection =
      markup
        .split('id="agent-pipeline"')[1]
        ?.split('id="dashboard-insight"')[0] ?? "";
    const connectorSvgs =
      pipelineSection.match(
        /<svg[^>]*data-pipeline-connector="status-transit"[\s\S]*?<\/svg>/g,
      ) ?? [];
    const recordTags =
      pipelineSection.match(
        /<div[^>]*data-pipeline-record="deal-data-analytics"[^>]*>/g,
      ) ?? [];

    expect(connectorSvgs).toHaveLength(6);
    expect(recordTags).toHaveLength(6);
    expect(pipelineSection).not.toContain("stroke-dasharray");
    expect(pipelineSection).not.toContain("stroke-dashoffset");
    expect(pipelineSection).not.toContain("lucide-arrow-right");
    expect(pipelineSection).not.toContain("Workspace viewer");
    expect(pipelineSection).not.toContain("External agent");
    expect(pipelineSection).not.toContain("lucide-sparkles");
    expect(pipelineSection).toContain("Claude");
    expect(
      pipelineSection.match(/data-native-agent-provider="claude"/g),
    ).toHaveLength(7);
    expect(
      pipelineSection.match(/data-agent-activity="thinking"/g),
    ).toHaveLength(2);
    expect(
      pipelineSection.match(/data-agent-activity="updating"/g),
    ).toHaveLength(2);
    expect(
      pipelineSection.match(/data-agent-activity="resolved"/g),
    ).toHaveLength(2);
    expect(
      pipelineSection.match(/data-native-person="max-bergmann"/g),
    ).toHaveLength(3);
    expect(
      pipelineSection.match(/data-pipeline-stop-port="right"/g),
    ).toHaveLength(3);
    expect(
      pipelineSection.match(/data-pipeline-stop-port="bottom"/g),
    ).toHaveLength(3);

    const progressByPhase = {
      focal: 0.52,
      opening: 0,
      resolved: 1,
    } as const;

    for (const placement of ["narrow", "wide"] as const) {
      const layout = AGENT_PIPELINE_STORYBOARD_LAYOUT[placement];

      if (layout.record.follows === "x") {
        expect(layout.connector.source.x).toBe(
          layout.origin.x + layout.origin.width,
        );
        expect(layout.connector.source.y).toBeGreaterThanOrEqual(
          layout.origin.y,
        );
        expect(layout.connector.source.y).toBeLessThanOrEqual(
          layout.origin.y + layout.origin.height,
        );
        expect(
          layout.connector.target.x + layout.record.width,
        ).toBeLessThanOrEqual(100);
      } else {
        expect(layout.connector.source.y).toBe(
          layout.origin.y + layout.origin.height,
        );
        expect(layout.connector.source.x).toBeGreaterThanOrEqual(
          layout.origin.x,
        );
        expect(layout.connector.source.x).toBeLessThanOrEqual(
          layout.origin.x + layout.origin.width,
        );
        expect(
          layout.connector.target.y + layout.record.height,
        ).toBeLessThanOrEqual(100);
      }

      for (const phase of MOTION_FRAME_SEQUENCE) {
        const progress = progressByPhase[phase];
        const drawTarget = trimAuthoredConnector(
          layout.connector,
          progress,
        ).target;
        const svg = connectorSvgs.find(
          (candidate) =>
            candidate.includes(`data-pipeline-phase="${phase}"`) &&
            candidate.includes(`data-pipeline-placement="${placement}"`),
        );
        const record = recordTags.find(
          (candidate) =>
            candidate.includes(`data-pipeline-record-phase="${phase}"`) &&
            candidate.includes(`data-pipeline-record-placement="${placement}"`),
        );

        expect(svg, `${placement} ${phase} connector`).toBeDefined();
        expect(record, `${placement} ${phase} record`).toBeDefined();
        expect(svg).toContain(
          `data-connector-draw-target="${drawTarget.x},${drawTarget.y}"`,
        );
        expect(svg).toContain(`data-motion-progress="${progress.toFixed(3)}"`);
        expect(svg).toContain('stroke-linecap="butt"');
        expect(svg).toContain('vector-effect="non-scaling-stroke"');
        expect(record).toContain(
          `data-pipeline-record-entry="${drawTarget.x},${drawTarget.y}"`,
        );

        const expectedRecordPosition =
          layout.record.follows === "x"
            ? `${drawTarget.x},${layout.record.y}`
            : `${layout.record.x},${drawTarget.y}`;
        expect(record).toContain(
          `data-pipeline-record-position="${expectedRecordPosition}"`,
        );

        if (layout.record.follows === "x") {
          expect(drawTarget.y).toBeGreaterThanOrEqual(layout.record.y);
          expect(drawTarget.y).toBeLessThanOrEqual(
            layout.record.y + layout.record.height,
          );
        } else {
          expect(drawTarget.x).toBeGreaterThanOrEqual(layout.record.x);
          expect(drawTarget.x).toBeLessThanOrEqual(
            layout.record.x + layout.record.width,
          );
        }
      }
    }

    expect(
      recordTags.filter((record) =>
        record.includes('data-pipeline-record-status="deal-open"'),
      ),
    ).toHaveLength(4);
    expect(
      recordTags.filter((record) =>
        record.includes('data-pipeline-record-status="deal-won"'),
      ),
    ).toHaveLength(2);
  });

  it("keeps every stated truth source reachable in this checkout", () => {
    const missing = MOTION_STORYBOARDS.flatMap(
      ({ sourceFacts }) => sourceFacts,
    ).filter((source) => !existsSync(join(REPO_ROOT, source)));

    expect(missing).toEqual([]);
  });

  it("does not revive the invented marketing pipeline or imply scoring, forecasting, or growth", () => {
    const source = `${JSON.stringify(MOTION_STORYBOARDS)}\n${readFileSync(COMPONENT, "utf8")}`;

    for (const forbidden of ["Demo", "Proposal", "Negotiation"]) {
      expect(source).not.toContain(forbidden);
    }

    expect(source.toLowerCase()).not.toMatch(
      /\b(?:score|scoring|forecast|forecasting|growth)\b/,
    );
    expect(source).not.toContain("relationship between Open and Won");
  });

  it("keeps videos and component-faithful scenes out of the storyboard chapter", () => {
    const source = readFileSync(COMPONENT, "utf8");

    expect(source).not.toMatch(
      /AppVideo|\.mp4|marketing\/scenes|marketing\/schematics/,
    );
  });
});

describe("motion storyboard planted violations", () => {
  it("rejects drift after the reviewed keyframes were approved", () => {
    const valid = storyboard("inbox");
    const drifted = {
      ...valid,
      frames: [
        valid.frames[0],
        { ...valid.frames[1], state: `${valid.frames[1].state} Changed.` },
        valid.frames[2],
      ],
    } as MotionStoryboard;

    expect(
      motionStoryboardApprovalViolations(
        drifted,
        MOTION_STORYBOARD_APPROVALS[valid.id],
      )[0],
    ).toMatch(/^approved storyboard checksum is stale/u);
  });

  it("rejects a second journey", () => {
    const valid = storyboard("inbox");
    const invalid = {
      ...valid,
      journeys: [...valid.journeys, ...valid.journeys],
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "storyboards require exactly one journey",
    );
  });

  it("rejects a cursor in a system journey", () => {
    const valid = storyboard("inbox");
    const invalid = {
      ...valid,
      frames: [
        valid.frames[0],
        { ...valid.frames[1], cursor: "causal-human" },
        valid.frames[2],
      ],
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "a cursor cannot act in a system or external-client journey",
    );
  });

  it("rejects an active inbox source that does not match the resolved Contact", () => {
    const valid = storyboard("inbox");
    if (valid.kind !== "inbox") throw new Error("expected inbox storyboard");
    const invalid = {
      ...valid,
      contact: { ...valid.contact, person: "leon-becker" },
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "the active inbox source must match the resolved Contact person",
    );
  });

  it("rejects a provider and person pairing outside the seeded messaging fixtures", () => {
    const valid = storyboard("inbox");
    if (valid.kind !== "inbox") throw new Error("expected inbox storyboard");
    const invalid = {
      ...valid,
      channels: [
        valid.channels[0],
        { person: "sophie-wagner", provider: "linkedin" },
        valid.channels[2],
      ],
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "inbox provider and person pairings must come from the seeded messaging fixtures",
    );
  });

  it("rejects changing Anna Müller's seeded Gmail thread to unread", () => {
    const valid = storyboard("inbox");
    if (valid.kind !== "inbox") throw new Error("expected inbox storyboard");
    const invalid = {
      ...valid,
      thread: { ...valid.thread, state: "unread" },
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "the seeded Anna Müller Gmail thread must remain open",
    );
  });

  it("rejects a pipeline label outside the seeded Status model", () => {
    const valid = storyboard("pipeline");
    if (valid.kind !== "pipeline")
      throw new Error("expected pipeline storyboard");
    const invalid = {
      ...valid,
      statusChange: { from: "deal-open", to: "deal-proposal" },
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "pipeline status labels must come from the seeded deal Status model",
    );
  });

  it("rejects a pipeline journey that does not change Status", () => {
    const valid = storyboard("pipeline");
    if (valid.kind !== "pipeline")
      throw new Error("expected pipeline storyboard");
    const invalid = {
      ...valid,
      statusChange: { from: "deal-open", to: "deal-open" },
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "pipeline origin and destination must be different Status options",
    );
  });

  it("rejects a pipeline journey that invents another field", () => {
    const valid = storyboard("pipeline");
    if (valid.kind !== "pipeline")
      throw new Error("expected pipeline storyboard");
    const invalid = {
      ...valid,
      field: "Stage",
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "pipeline changes must name the fixture-backed Status field",
    );
  });

  it("rejects a pipeline assignee outside the seeded deal-user fixture", () => {
    const valid = storyboard("pipeline");
    if (valid.kind !== "pipeline")
      throw new Error("expected pipeline storyboard");
    const invalid = {
      ...valid,
      assignedUser: "leon-becker",
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "pipeline assigned user must match the seeded deal-user fixture",
    );
  });

  it("rejects an unsupported or copy-mismatched pipeline agent provider", () => {
    const valid = storyboard("pipeline");
    if (valid.kind !== "pipeline")
      throw new Error("expected pipeline storyboard");
    const unsupported = {
      ...valid,
      agentProvider: "cursor",
    } as unknown as MotionStoryboard;
    const mismatched = {
      ...valid,
      agentProvider: "gemini",
    } as MotionStoryboard;

    expect(motionStoryboardViolations(unsupported)).toContain(
      "pipeline agent providers must use an approved native identity",
    );
    expect(motionStoryboardViolations(mismatched)).toContain(
      "pipeline copy must name the selected agent provider",
    );
  });

  it("rejects dashboard forecasting", () => {
    const valid = storyboard("dashboard");
    const invalid = {
      ...valid,
      purpose: "forecasting",
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "dashboard storyboards may depict inspection only",
    );
  });

  it("rejects a relative dashboard quantity encoding", () => {
    const valid = storyboard("dashboard");
    const invalid = {
      ...valid,
      quantityEncoding: "relative-bar",
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "dashboard quantities must use one discrete token per fixture-backed deal",
    );
  });

  it("rejects non-whole or fixture-mismatched dashboard token counts", () => {
    const valid = storyboard("dashboard");
    if (valid.kind !== "dashboard")
      throw new Error("expected dashboard storyboard");
    const fractional = {
      ...valid,
      segments: [
        valid.segments[0],
        { ...valid.segments[1], count: 3.5 },
        valid.segments[2],
      ],
    } as unknown as MotionStoryboard;
    const wrongFixtureCount = {
      ...valid,
      segments: [
        valid.segments[0],
        { ...valid.segments[1], count: 5 },
        valid.segments[2],
      ],
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(fractional)).toContain(
      "dashboard token counts must be positive whole fixture counts",
    );
    expect(motionStoryboardViolations(wrongFixtureCount)).toContain(
      "dashboard token counts must match the checked-in Deal Overview fixtures",
    );
  });

  it("rejects an unseeded total, weighted detail, or all-group value disclosure", () => {
    const valid = storyboard("dashboard");
    if (valid.kind !== "dashboard")
      throw new Error("expected dashboard storyboard");
    const wrongTotal = {
      ...valid,
      segments: [
        valid.segments[0],
        { ...valid.segments[1], totalValue: 545_501 },
        valid.segments[2],
      ],
    } as unknown as MotionStoryboard;
    const weightedDetail = {
      ...valid,
      segments: [
        valid.segments[0],
        { ...valid.segments[1], weightedValue: 545_500 },
        valid.segments[2],
      ],
    } as unknown as MotionStoryboard;
    const allGroups = {
      ...valid,
      valueDisclosure: "all-groups",
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(wrongTotal)).toContain(
      "dashboard total values must match the checked-in deal and service fixtures",
    );
    expect(motionStoryboardViolations(weightedDetail)).toContain(
      "dashboard inspection exposes selected total value only",
    );
    expect(motionStoryboardViolations(allGroups)).toContain(
      "dashboard value detail must be disclosed for the selected Status group only",
    );
  });

  it("rejects a missing selected group or a duplicate Deal Overview Status", () => {
    const valid = storyboard("dashboard");
    if (valid.kind !== "dashboard")
      throw new Error("expected dashboard storyboard");
    const missingSelection = {
      ...valid,
      selectedSegment: "deal-abandoned",
    } as unknown as MotionStoryboard;
    const duplicate = {
      ...valid,
      segments: [valid.segments[0], valid.segments[0], valid.segments[2]],
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(missingSelection)).toContain(
      "dashboard selected segment must exist in the rendered distribution",
    );
    expect(motionStoryboardViolations(duplicate)).toContain(
      "dashboard segments must contain each Deal Overview Status exactly once",
    );
  });

  it("rejects a dashboard segment excluded by the seeded widget filter", () => {
    const valid = storyboard("dashboard");
    if (valid.kind !== "dashboard")
      throw new Error("expected dashboard storyboard");
    const invalid = {
      ...valid,
      segments: [
        ...valid.segments,
        { count: 1, status: "deal-abandoned", totalValue: 156_400 },
      ],
    } as unknown as MotionStoryboard;

    expect(motionStoryboardViolations(invalid)).toContain(
      "dashboard segments must apply the Deal Overview widget filter",
    );
  });
});
