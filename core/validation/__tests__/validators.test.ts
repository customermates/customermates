/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from "vitest";
import type { z } from "zod";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { IdentifierInput } from "@/features/contacts/contact.schema";
import { CustomColumnType, EntityType, MessagingProvider } from "@/generated/prisma";

import { CustomErrorCode } from "../validation.types";
import { validateAssigneeGuard } from "../validate-assignee-guard";
import { normalizeChannelValue } from "@/features/contacts/channel-value";
import { validateIdentifierConflicts, validateIdentifiers } from "@/features/contacts/upsert/validate-identifiers";
import { validateCustomFieldEmail } from "../validate-custom-field-email";
import { validateCustomFieldPhone } from "../validate-custom-field-phone";
import { validateCustomFieldCurrency } from "../validate-custom-field-currency";
import { validateCustomFieldLink } from "../validate-custom-field-link";
import { validateCustomFieldDate } from "../validate-custom-field-date";
import { validateCustomFieldDateTime } from "../validate-custom-field-date-time";
import { validateCustomFieldDateRange } from "../validate-custom-field-date-range";
import { validateCustomFieldDateTimeRange } from "../validate-custom-field-date-time-range";
import { validateCustomFieldSingleSelect } from "../validate-custom-field-single-select";
import { validateCustomColumnExists } from "../validate-custom-column-exists";
import { validateEvent } from "../validate-event";
import {
  validateOrganizationIds,
  validateUserIds,
  validateDealIds,
  validateServiceIds,
  validateTaskIds,
  validateSystemTaskIds,
} from "../ids-validators";

function createMockCtx() {
  const issues: unknown[] = [];
  return {
    addIssue: vi.fn((issue: unknown) => issues.push(issue)),
    issues,
    path: [],
  } as unknown as z.RefinementCtx & { issues: unknown[] };
}

describe("validateCustomFieldEmail", () => {
  it("passes for a valid email", () => {
    const ctx = createMockCtx();
    validateCustomFieldEmail("user@example.com", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue for an invalid email", () => {
    const ctx = createMockCtx();
    validateCustomFieldEmail("not-an-email", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidEmail } }),
    );
  });

  it("validates multiple emails when allowMultiple is true", () => {
    const ctx = createMockCtx();
    validateCustomFieldEmail("a@b.com, c@d.com", ctx, ["value"], true);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue for each invalid email in a comma-separated list", () => {
    const ctx = createMockCtx();
    validateCustomFieldEmail("bad1, bad2", ctx, ["value"], true);
    expect(ctx.addIssue).toHaveBeenCalledTimes(2);
  });

  it("handles array input", () => {
    const ctx = createMockCtx();
    validateCustomFieldEmail(["a@b.com", "invalid"], ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
  });
});

describe("validateCustomFieldPhone", () => {
  it("passes for a valid E.164 phone number", () => {
    const ctx = createMockCtx();
    validateCustomFieldPhone("+14155552671", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue for an invalid phone number", () => {
    const ctx = createMockCtx();
    validateCustomFieldPhone("12345", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidPhone } }),
    );
  });

  it("validates multiple phones when allowMultiple is true", () => {
    const ctx = createMockCtx();
    validateCustomFieldPhone("+14155552671, +442071234567", ctx, ["value"], true);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });
});

describe("validateCustomFieldCurrency", () => {
  it("passes for a valid numeric string", () => {
    const ctx = createMockCtx();
    validateCustomFieldCurrency("100.50", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("passes for zero", () => {
    const ctx = createMockCtx();
    validateCustomFieldCurrency("0", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue for non-numeric string", () => {
    const ctx = createMockCtx();
    validateCustomFieldCurrency("abc", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidCurrency } }),
    );
  });

  it("passes for negative number string", () => {
    const ctx = createMockCtx();
    validateCustomFieldCurrency("-50", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });
});

describe("validateCustomFieldLink", () => {
  it("passes for a valid HTTPS URL", () => {
    const ctx = createMockCtx();
    validateCustomFieldLink("https://example.com", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("passes for a valid HTTP URL", () => {
    const ctx = createMockCtx();
    validateCustomFieldLink("http://example.com", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue for an invalid URL", () => {
    const ctx = createMockCtx();
    validateCustomFieldLink("not a url", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidUrl } }),
    );
  });

  it("validates multiple URLs when allowMultiple is true", () => {
    const ctx = createMockCtx();
    validateCustomFieldLink("https://a.com, https://b.com", ctx, ["value"], true);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });
});

describe("validateCustomFieldDate", () => {
  it("accepts a date-only string", () => {
    const ctx = createMockCtx();
    validateCustomFieldDate("2024-01-15", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("accepts a full ISO datetime (lenient inbound for UI submissions)", () => {
    const ctx = createMockCtx();
    validateCustomFieldDate("2024-01-15T00:00:00Z", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("rejects an invalid string with customFieldInvalidDate", () => {
    const ctx = createMockCtx();
    validateCustomFieldDate("not-a-date", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidDate } }),
    );
  });
});

describe("validateCustomFieldDateTime", () => {
  it("accepts a full ISO datetime", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateTime("2024-01-15T10:30:00Z", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("rejects a date-only string with customFieldInvalidDateTime", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateTime("2024-01-15", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidDateTime } }),
    );
  });

  it("rejects an invalid string with customFieldInvalidDateTime", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateTime("not-a-date", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidDateTime } }),
    );
  });
});

describe("validateCustomFieldDateRange", () => {
  it("accepts two date-only strings comma-separated", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateRange("2024-01-15,2024-01-22", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("accepts two ISO datetimes comma-separated (lenient inbound)", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateRange("2024-01-15T00:00:00Z,2024-01-22T00:00:00Z", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("rejects when start is after end", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateRange("2024-01-22,2024-01-15", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidDateRange } }),
    );
  });

  it("rejects a single value (no comma)", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateRange("2024-01-15", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidDateRange } }),
    );
  });

  it("rejects when one half is invalid", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateRange("2024-01-15,not-a-date", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidDateRange } }),
    );
  });
});

describe("validateCustomFieldDateTimeRange", () => {
  it("accepts two ISO datetimes comma-separated", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateTimeRange("2024-01-15T09:00:00Z,2024-01-15T17:00:00Z", ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("rejects date-only strings with customFieldInvalidDateTimeRange", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateTimeRange("2024-01-15,2024-01-22", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidDateTimeRange } }),
    );
  });

  it("rejects when start is after end", () => {
    const ctx = createMockCtx();
    validateCustomFieldDateTimeRange("2024-01-15T17:00:00Z,2024-01-15T09:00:00Z", ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidDateTimeRange } }),
    );
  });
});

describe("validateCustomFieldSingleSelect", () => {
  const column: CustomColumnDto = {
    id: "col-1",
    label: "Status",
    entityType: EntityType.contact,
    type: CustomColumnType.singleSelect,
    options: {
      options: [
        { value: "opt-1", label: "Active", color: "success", isDefault: true, index: 0 },
        { value: "opt-2", label: "Inactive", color: "destructive", isDefault: false, index: 1 },
      ],
    },
  };

  it("passes for a valid option UUID", () => {
    const ctx = createMockCtx();
    validateCustomFieldSingleSelect("opt-1", column, ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue for an invalid option", () => {
    const ctx = createMockCtx();
    validateCustomFieldSingleSelect("opt-999", column, ctx, ["value"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ error: CustomErrorCode.customFieldInvalidSingleSelect }),
      }),
    );
  });

  it("includes valid values in the issue params", () => {
    const ctx = createMockCtx();
    validateCustomFieldSingleSelect("bad", column, ctx, ["value"]);
    const call = (ctx.addIssue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.params.validValues).toEqual(["Active (opt-1)", "Inactive (opt-2)"]);
  });

  it("skips validation if column type is not singleSelect", () => {
    const plainColumn = {
      id: "col-2",
      label: "Notes",
      entityType: EntityType.contact,
      type: CustomColumnType.plain,
    } as CustomColumnDto;
    const ctx = createMockCtx();
    validateCustomFieldSingleSelect("anything", plainColumn, ctx, ["value"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });
});

describe("validateCustomColumnExists", () => {
  const columns: CustomColumnDto[] = [
    {
      id: "col-1",
      label: "Email",
      entityType: EntityType.contact,
      type: CustomColumnType.email,
      options: { color: "default", allowMultiple: false },
    },
    {
      id: "col-2",
      label: "Phone",
      entityType: EntityType.contact,
      type: CustomColumnType.phone,
      options: { color: "secondary", allowMultiple: true },
    },
  ];

  it("returns the column when it exists", () => {
    const ctx = createMockCtx();
    const result = validateCustomColumnExists("col-1", columns, ctx, ["columnId"]);
    expect(result).toEqual(columns[0]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("returns null and adds issue when column does not exist", () => {
    const ctx = createMockCtx();
    const result = validateCustomColumnExists("col-999", columns, ctx, ["columnId"]);
    expect(result).toBeNull();
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ error: CustomErrorCode.customColumnNotFound }),
      }),
    );
  });

  it("includes valid column labels in issue params", () => {
    const ctx = createMockCtx();
    validateCustomColumnExists("missing", columns, ctx, ["columnId"]);
    const call = (ctx.addIssue as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.params.validValues).toEqual(["Email (col-1)", "Phone (col-2)"]);
  });
});

describe("validateEvent", () => {
  it("passes for a valid domain event", () => {
    const ctx = createMockCtx();
    validateEvent("contact.created", ctx, ["events"]);
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
    validateEvent(["contact.created", "bad.event", "deal.updated"], ctx, ["events"]);
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
  });
});

describe("validateOrganizationIds", () => {
  const validIds = new Set(["org-1", "org-2", "org-3"]);

  it("does not add issues when all IDs are valid", () => {
    const ctx = createMockCtx();
    validateOrganizationIds(["org-1", "org-2"], validIds, ctx, ["organizationIds"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue for each invalid ID", () => {
    const ctx = createMockCtx();
    validateOrganizationIds(["org-1", "org-bad", "org-worse"], validIds, ctx, ["organizationIds"]);
    expect(ctx.addIssue).toHaveBeenCalledTimes(2);
  });

  it("does not add issues for empty array", () => {
    const ctx = createMockCtx();
    validateOrganizationIds([], validIds, ctx, ["organizationIds"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("skips validation for null", () => {
    const ctx = createMockCtx();
    validateOrganizationIds(null, validIds, ctx, ["organizationIds"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("skips validation for undefined", () => {
    const ctx = createMockCtx();
    validateOrganizationIds(undefined, validIds, ctx, ["organizationIds"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("handles single string input", () => {
    const ctx = createMockCtx();
    validateOrganizationIds("org-bad", validIds, ctx, ["organizationIds"]);
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
  });
});

describe("validateUserIds", () => {
  const validIds = new Set(["user-1", "user-2"]);

  it("does not add issues when all IDs are valid", () => {
    const ctx = createMockCtx();
    validateUserIds(["user-1"], validIds, ctx, ["userIds"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue with userNotFound error code", () => {
    const ctx = createMockCtx();
    validateUserIds(["user-bad"], validIds, ctx, ["userIds"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.userNotFound } }),
    );
  });
});

describe("validateDealIds", () => {
  const validIds = new Set(["deal-1"]);

  it("adds issue with dealNotFound error code", () => {
    const ctx = createMockCtx();
    validateDealIds(["deal-bad"], validIds, ctx, ["dealIds"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.dealNotFound } }),
    );
  });
});

describe("validateServiceIds", () => {
  const validIds = new Set(["svc-1"]);

  it("adds issue with serviceNotFound error code", () => {
    const ctx = createMockCtx();
    validateServiceIds(["svc-bad"], validIds, ctx, ["serviceIds"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.serviceNotFound } }),
    );
  });
});

describe("validateTaskIds", () => {
  const validIds = new Set(["task-1"]);

  it("adds issue with taskNotFound error code", () => {
    const ctx = createMockCtx();
    validateTaskIds(["task-bad"], validIds, ctx, ["taskIds"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.taskNotFound } }),
    );
  });
});

describe("validateSystemTaskIds", () => {
  const systemTaskIds = new Set(["sys-1", "sys-2"]);

  it("adds issue when trying to delete a system task", () => {
    const ctx = createMockCtx();
    validateSystemTaskIds(["sys-1"], systemTaskIds, ctx, ["ids"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.taskOnlyCustomTasksCanBeDeleted } }),
    );
  });

  it("does not add issue for non-system task IDs", () => {
    const ctx = createMockCtx();
    validateSystemTaskIds(["custom-1"], systemTaskIds, ctx, ["ids"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("skips validation for null/undefined", () => {
    const ctx = createMockCtx();
    validateSystemTaskIds(null, systemTaskIds, ctx, ["ids"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
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

  it("normalizes a whatsapp number to bare digits", () => {
    expect(normalizeChannelValue(MessagingProvider.whatsapp, "+49 170 1234567")).toBe("491701234567");
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

describe("validateIdentifiers", () => {
  it("drops messagingId for deterministic providers", () => {
    const ctx = createMockCtx();
    const identifiers = [
      { provider: MessagingProvider.mail, value: "a@b.com", messagingId: "nonsense" } as IdentifierInput,
      { provider: MessagingProvider.linkedin, value: "handle", messagingId: "ACoAA123" } as IdentifierInput,
    ];
    validateIdentifiers(identifiers, ctx, ["identifiers"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
    expect(identifiers[0].messagingId).toBeUndefined();
    expect(identifiers[1].messagingId).toBe("ACoAA123");
  });
});

describe("validateIdentifierConflicts", () => {
  const mailIdentifier = (value: string) => ({ provider: MessagingProvider.mail, value }) as IdentifierInput;

  it("passes when the identifier belongs to the same contact", () => {
    const ctx = createMockCtx();
    const owners = new Map([["mail:a@b.com", "contact-1"]]);
    validateIdentifierConflicts(
      [{ selfContactId: "contact-1", identifiers: [mailIdentifier("a@b.com")] }],
      owners,
      ctx,
      () => ["identifiers"],
    );
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue when the identifier belongs to another contact", () => {
    const ctx = createMockCtx();
    const owners = new Map([["mail:a@b.com", "contact-2"]]);
    validateIdentifierConflicts(
      [{ selfContactId: "contact-1", identifiers: [mailIdentifier("a@b.com")] }],
      owners,
      ctx,
      () => ["identifiers"],
    );
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.channelAlreadyLinked } }),
    );
  });

  it("adds issue when two batch rows claim the same identifier", () => {
    const ctx = createMockCtx();
    validateIdentifierConflicts(
      [
        { selfContactId: "batch-row:0", identifiers: [mailIdentifier("a@b.com")] },
        { selfContactId: "batch-row:1", identifiers: [mailIdentifier("a@b.com")] },
      ],
      new Map<string, string>(),
      ctx,
      (i) => ["rows", i],
    );
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
  });

  it("passes when one batch row repeats its own identifier", () => {
    const ctx = createMockCtx();
    validateIdentifierConflicts(
      [{ selfContactId: "batch-row:0", identifiers: [mailIdentifier("a@b.com"), mailIdentifier("a@b.com")] }],
      new Map<string, string>(),
      ctx,
      () => ["rows", 0],
    );
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("rejects handle-provider channels owned by another contact", () => {
    const ctx = createMockCtx();
    const owners = new Map([["linkedin:handle", "contact-2"]]);
    validateIdentifierConflicts(
      [
        {
          selfContactId: "contact-1",
          identifiers: [{ provider: MessagingProvider.linkedin, value: "handle" } as IdentifierInput],
        },
      ],
      owners,
      ctx,
      () => ["identifiers"],
    );
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.channelAlreadyLinked } }),
    );
  });
});
