import { describe, expect, it } from "vitest";

import { describeAgentTool } from "../agent-activity";
import { approvalTargetRefusal } from "../agent-approval-guard";
import { internalToolIdentity } from "../tool-identity";

const itemId = "00000000-0000-4000-8000-000000000001";

describe("agent destructive approval guard", () => {
  const request = {
    toolName: "manage_trash",
    input: { action: "delete_permanently", itemIds: [itemId] },
  };
  const activity = {
    ...describeAgentTool(internalToolIdentity("manage_trash"), request.input),
    context: { labels: ["record: Lowell renewal"] },
  };

  it("refuses an absent Trash target before the first card", () => {
    expect(approvalTargetRefusal(request, { ...activity, context: undefined }, [], new Set(), null)).toContain(
      "could not be found",
    );
  });

  it("refuses a different exact title before the first card", () => {
    expect(
      approvalTargetRefusal(
        request,
        activity,
        ["Lowell renewal"],
        new Set(),
        'Purge the trashed deal "Lowell renewal 2026".',
      ),
    ).toContain('"Lowell renewal 2026" was not found');
  });

  it("opens only one approval for repeat calls against the same target", () => {
    const seen = new Set<string>();
    expect(
      approvalTargetRefusal(request, activity, ["Lowell renewal"], seen, 'Purge the trashed deal "Lowell renewal".'),
    ).toBeNull();
    expect(
      approvalTargetRefusal(request, activity, ["Lowell renewal"], seen, 'Purge the trashed deal "Lowell renewal".'),
    ).toContain("already submitted");
  });

  it("accepts an exact saved-view name without a kind prefix", () => {
    const viewRequest = {
      toolName: "manage_data_views",
      input: { action: "delete", surfaceKey: "dashboard", viewKey: itemId },
    };
    const viewActivity = {
      ...describeAgentTool(internalToolIdentity("manage_data_views"), viewRequest.input),
      context: { labels: ["Q1 pipeline (old)"] },
    };
    expect(
      approvalTargetRefusal(viewRequest, viewActivity, ["Q1 pipeline (old)"], new Set(), 'Delete "Q1 pipeline (old)".'),
    ).toBeNull();
  });
});
