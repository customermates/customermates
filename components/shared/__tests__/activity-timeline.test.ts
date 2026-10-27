import type { FunctionComponent } from "react";
import type { ActivityTimelineStatus } from "../activity-timeline";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActivityTimeline, ActivityTimelineRow } from "../activity-timeline";

const Row = ActivityTimelineRow as FunctionComponent<{ status: ActivityTimelineStatus }>;
const base = { onOpenChange: () => undefined, open: true, summary: "Reading pages", testId: "timeline" };

describe("ActivityTimeline", () => {
  it("makes the summary a toggle with its rows when there are details", () => {
    const markup = renderToStaticMarkup(
      createElement(
        ActivityTimeline,
        { ...base, hasDetails: true, status: "running" },
        createElement(Row, { status: "done" }, "Found pages"),
      ),
    );

    expect(markup).toContain('data-testid="timeline"');
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*>.*Reading pages/);
    expect(markup).toContain("animate-spin");
    expect(markup).toContain("Found pages");
  });

  it("shows only a static summary without details and colours it when destructive", () => {
    const markup = renderToStaticMarkup(
      createElement(
        ActivityTimeline,
        { ...base, destructive: true, hasDetails: false, status: "error" },
        createElement(Row, { status: "done" }, "Hidden row"),
      ),
    );

    expect(markup).not.toContain("<button");
    expect(markup).toContain("text-destructive");
    expect(markup).not.toContain("Hidden row");
  });

  it("renders the action next to the summary", () => {
    const markup = renderToStaticMarkup(
      createElement(ActivityTimeline, {
        ...base,
        action: createElement("button", { type: "button" }, "Change"),
        hasDetails: false,
        status: "done",
      }),
    );

    expect(markup).toContain("Reading pages");
    expect(markup).toContain('<button type="button">Change</button>');
  });
});

describe("ActivityTimelineRow", () => {
  it("marks error rows as destructive and keeps the timeline line", () => {
    const markup = renderToStaticMarkup(createElement(Row, { status: "error" }, "Failed"));

    expect(markup).toContain("text-destructive");
    expect(markup).toContain("before:bg-border");
    expect(markup).toContain("Failed");
  });

  it("shows a neutral row without the destructive colour", () => {
    const markup = renderToStaticMarkup(createElement(Row, { status: "cancelled" }, "Skipped"));

    expect(markup).not.toContain("text-destructive");
    expect(markup).toContain("Skipped");
  });
});
