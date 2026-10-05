/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

import { MessagingProvider } from "@/generated/prisma";

import { checkIds } from "@/core/validation/validators/check-ids";
import { normalizeChannelValue } from "@/features/records/channel-value";
import { validateAssigneeGuard } from "../validate-assignee-guard";
import { validateEnumValue } from "../validate-enum-value";
import { validateEvent } from "../validate-event";
import { CustomErrorCode } from "../validation.types";

function createMockCtx() {
  const issues: unknown[] = [];
  return {
    addIssue: vi.fn((issue: unknown) => issues.push(issue)),
    issues,
    path: [],
  } as unknown as z.RefinementCtx & { issues: unknown[] };
}

describe("validateEvent", () => {
  it("passes for a valid domain event", () => {
    const ctx = createMockCtx();
    validateEvent("webhook.created", ctx, ["events"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue for an invalid event", () => {
    const ctx = createMockCtx();
    validateEvent("invalid.event", ctx, ["events"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.invalidFilterValue } }),
    );
  });

  it("validates arrays of events", () => {
    const ctx = createMockCtx();
    validateEvent(["webhook.created", "bad.event", "routine.updated"], ctx, ["events"]);
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
  });
});

describe("validateEnumValue", () => {
  const states = ["unread", "open", "closed", "spam"] as const;

  it("passes for a valid enum value", () => {
    const ctx = createMockCtx();
    validateEnumValue("unread", states, ctx, ["filters", 0, "value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds an invalidFilterValue issue for a value outside the enum", () => {
    const ctx = createMockCtx();
    validateEnumValue("bogus", states, ctx, ["filters", 0, "value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.invalidFilterValue } }),
    );
  });

  it("validates each element of an array and points the path at the bad index", () => {
    const ctx = createMockCtx();
    validateEnumValue(["unread", "bogus", "open"], states, ctx, ["filters", 0, "value"]);
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
    expect(ctx.addIssue).toHaveBeenCalledWith(expect.objectContaining({ path: ["filters", 0, "value", 1] }));
  });
});

describe("checkIds (entity id existence)", () => {
  const lookup = (valid: Set<string>) => () => Promise.resolve(valid);

  it("does not add issues when all ids are valid", async () => {
    const ctx = createMockCtx();
    await checkIds(
      [{ ids: ["org-1", "org-2"], path: ["organizationIds"] }],
      ctx,
      lookup(new Set(["org-1", "org-2", "org-3"])),
      CustomErrorCode.organizationNotFound,
    );
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds an issue for each invalid id, indexed by array position", async () => {
    const ctx = createMockCtx();
    await checkIds(
      [{ ids: ["org-1", "org-bad", "org-worse"], path: ["organizationIds"] }],
      ctx,
      lookup(new Set(["org-1"])),
      CustomErrorCode.organizationNotFound,
    );
    expect(ctx.addIssue).toHaveBeenCalledTimes(2);
    expect(ctx.addIssue).toHaveBeenCalledWith(expect.objectContaining({ path: ["organizationIds", 1] }));
  });

  it("skips null, undefined, and empty sources", async () => {
    for (const ids of [null, undefined, []] as (string[] | null | undefined)[]) {
      const ctx = createMockCtx();
      await checkIds(
        [{ ids, path: ["organizationIds"] }],
        ctx,
        lookup(new Set()),
        CustomErrorCode.organizationNotFound,
      );
      expect(ctx.addIssue).not.toHaveBeenCalled();
    }
  });

  it("handles a single string source with a base path", async () => {
    const ctx = createMockCtx();
    await checkIds(
      [{ ids: "org-bad", path: ["organizationIds"] }],
      ctx,
      lookup(new Set()),
      CustomErrorCode.organizationNotFound,
    );
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
    expect(ctx.addIssue).toHaveBeenCalledWith(expect.objectContaining({ path: ["organizationIds"] }));
  });

  it("resolves all entries in one findIds call and raises the supplied error code", async () => {
    const codes = [
      CustomErrorCode.userNotFound,
      CustomErrorCode.dealNotFound,
      CustomErrorCode.serviceNotFound,
      CustomErrorCode.taskNotFound,
      CustomErrorCode.widgetNotFound,
      CustomErrorCode.customColumnIdNotFound,
      CustomErrorCode.webhookNotFound,
      CustomErrorCode.webhookDeliveryNotFound,
      CustomErrorCode.threadNotFound,
      CustomErrorCode.roleNotFound,
    ];
    for (const code of codes) {
      const ctx = createMockCtx();
      const findIds = vi.fn(() => Promise.resolve(new Set(["present"])));
      await checkIds(
        [
          { ids: "present", path: ["a"] },
          { ids: "missing", path: ["b"] },
        ],
        ctx,
        findIds,
        code,
      );
      expect(findIds).toHaveBeenCalledTimes(1);
      expect(ctx.addIssue).toHaveBeenCalledTimes(1);
      expect(ctx.addIssue).toHaveBeenCalledWith(expect.objectContaining({ params: { error: code }, path: ["b"] }));
    }
  });
});

describe("validateAssigneeGuard", () => {
  it("skips when userIds is undefined", () => {
    const ctx = createMockCtx();
    validateAssigneeGuard(undefined, "user-1", false, ctx, ["userIds"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("skips when the user can read all", () => {
    const ctx = createMockCtx();
    validateAssigneeGuard([], "user-1", true, ctx, ["userIds"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("passes when the current user is assigned", () => {
    const ctx = createMockCtx();
    validateAssigneeGuard(["user-2", "user-1"], "user-1", false, ctx, ["userIds"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue when the current user is not assigned", () => {
    const ctx = createMockCtx();
    validateAssigneeGuard(["user-2"], "user-1", false, ctx, ["userIds"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.assigneeRequired }, path: ["userIds"] }),
    );
  });

  it("adds issue when assignees are cleared with an empty array", () => {
    const ctx = createMockCtx();
    validateAssigneeGuard([], "user-1", false, ctx, ["userIds"]);
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
  });

  it("adds issue when assignees are cleared with null", () => {
    const ctx = createMockCtx();
    validateAssigneeGuard(null, "user-1", false, ctx, ["userIds"]);
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
  });
});

describe("normalizeChannelValue", () => {
  it("lowercases a valid email", () => {
    expect(normalizeChannelValue(MessagingProvider.mail, "User@Example.COM")).toBe("user@example.com");
  });

  it("returns null for an invalid email", () => {
    expect(normalizeChannelValue(MessagingProvider.mail, "not-an-email")).toBeNull();
  });

  it("normalizes a whatsapp number to e164", () => {
    expect(normalizeChannelValue(MessagingProvider.whatsapp, "+49 170 1234567")).toBe("+491701234567");
  });

  it("returns null for a too-short whatsapp number", () => {
    expect(normalizeChannelValue(MessagingProvider.whatsapp, "123")).toBeNull();
  });

  it("returns the trimmed value for handle providers", () => {
    expect(normalizeChannelValue(MessagingProvider.linkedin, " some-handle ")).toBe("some-handle");
  });

  it("extracts the handle from a pasted profile URL", () => {
    expect(normalizeChannelValue(MessagingProvider.linkedin, "https://www.linkedin.com/in/max-mustermann/")).toBe(
      "max-mustermann",
    );
    expect(normalizeChannelValue(MessagingProvider.telegram, "https://t.me/somebody?start=x")).toBe("somebody");
    expect(normalizeChannelValue(MessagingProvider.instagram, "instagram.com/some.user")).toBe("some.user");
  });

  it("strips a leading @ from handles", () => {
    expect(normalizeChannelValue(MessagingProvider.telegram, "@somebody")).toBe("somebody");
  });

  it("accepts ingest-shaped handle values", () => {
    expect(normalizeChannelValue(MessagingProvider.telegram, "+4915140388937")).toBe("+4915140388937");
    expect(normalizeChannelValue(MessagingProvider.linkedin, "ACoAAB1cD_x=")).toBe("ACoAAB1cD_x=");
  });

  it("rejects handles with spaces or invalid characters", () => {
    expect(normalizeChannelValue(MessagingProvider.linkedin, "john doe")).toBeNull();
    expect(normalizeChannelValue(MessagingProvider.instagram, "name#fragment")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizeChannelValue(MessagingProvider.mail, "   ")).toBeNull();
  });
});
