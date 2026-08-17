/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from "vitest";
import type { z } from "zod";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { IdentifierInput } from "@/features/contacts/contact.schema";
import { CustomColumnType, EntityType, MessagingProvider } from "@/generated/prisma";

import { CustomErrorCode } from "../validation.types";
import { validateAssigneeGuard } from "../validate-assignee-guard";
import { validateOwnRoleGuard } from "../validate-own-role-guard";
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
import { validateEnumValue } from "../validate-enum-value";
import { checkIds } from "@/core/validation/validators/check-ids";
import { ValidateSystemTaskIdsInteractor } from "@/features/tasks/upsert/validate-system-task-ids.interactor";

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

  it.each([["/internal/report.pdf"], ["//cdn.example.com/report.pdf"]])(
    "adds an issue for the relative reference %j instead of resolving it to another host",
    (value) => {
      const ctx = createMockCtx();
      validateCustomFieldLink(value, ctx, ["value"]);
      expect(ctx.addIssue).toHaveBeenCalledWith(
        expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidUrl } }),
      );
    },
  );
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

describe("ValidateSystemTaskIdsInteractor.invoke", () => {
  const makeGuard = (systemIds: string[]) =>
    new ValidateSystemTaskIdsInteractor({ findSystemTaskIds: () => Promise.resolve(new Set(systemIds)) } as never);

  it("adds an issue when trying to delete a system task", async () => {
    const ctx = createMockCtx();
    await makeGuard(["sys-1", "sys-2"]).invoke([{ ids: ["sys-1"], path: ["ids"] }], ctx);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.taskOnlyCustomTasksCanBeDeleted } }),
    );
  });

  it("does not add an issue for non-system task ids", async () => {
    const ctx = createMockCtx();
    await makeGuard(["sys-1"]).invoke([{ ids: ["custom-1"], path: ["ids"] }], ctx);
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

describe("validateOwnRoleGuard", () => {
  it("skips when no role id is supplied, as when creating a role", () => {
    const ctx = createMockCtx();
    validateOwnRoleGuard(undefined, "role-1", ctx, ["id"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("skips when the caller holds no role", () => {
    const ctx = createMockCtx();
    validateOwnRoleGuard("role-1", null, ctx, ["id"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("passes when editing a role the caller does not hold", () => {
    const ctx = createMockCtx();
    validateOwnRoleGuard("role-2", "role-1", ctx, ["id"]);
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("adds issue when editing the role the caller holds", () => {
    const ctx = createMockCtx();
    validateOwnRoleGuard("role-1", "role-1", ctx, ["id"]);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.roleSelfEditForbidden }, path: ["id"] }),
    );
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
    const owners = new Map([["email:a@b.com", "contact-1"]]);
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
    const owners = new Map([["email:a@b.com", "contact-2"]]);
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

  it("treats the same email under different providers as one identity (class-keyed)", () => {
    const ctx = createMockCtx();
    const owners = new Map([["email:a@b.com", "contact-2"]]);
    validateIdentifierConflicts(
      [
        {
          selfContactId: "contact-1",
          identifiers: [{ provider: MessagingProvider.google, value: "a@b.com" } as IdentifierInput],
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

  it("rejects a repeated identifier inside one batch row", () => {
    const ctx = createMockCtx();
    validateIdentifierConflicts(
      [{ selfContactId: "batch-row:0", identifiers: [mailIdentifier("a@b.com"), mailIdentifier("a@b.com")] }],
      new Map<string, string>(),
      ctx,
      () => ["rows", 0],
    );
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.duplicateChannel }, path: ["rows", 0, 1, "value"] }),
    );
  });

  it("rejects a repeated identifier inside one create payload", () => {
    const ctx = createMockCtx();
    validateIdentifierConflicts(
      [{ selfContactId: undefined, identifiers: [mailIdentifier("a@b.com"), mailIdentifier("a@b.com")] }],
      new Map<string, string>(),
      ctx,
      () => ["identifiers"],
    );
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.duplicateChannel } }),
    );
  });

  it("rejects the same address listed under two email providers in one create payload", () => {
    const ctx = createMockCtx();
    validateIdentifierConflicts(
      [
        {
          selfContactId: undefined,
          identifiers: [
            mailIdentifier("a@b.com"),
            { provider: MessagingProvider.google, value: "a@b.com" } as IdentifierInput,
          ],
        },
      ],
      new Map<string, string>(),
      ctx,
      () => ["identifiers"],
    );
    expect(ctx.addIssue).toHaveBeenCalledTimes(1);
    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { error: CustomErrorCode.duplicateChannel },
        path: ["identifiers", 1, "value"],
      }),
    );
  });

  it("passes distinct identifiers in one create payload", () => {
    const ctx = createMockCtx();
    validateIdentifierConflicts(
      [
        {
          selfContactId: undefined,
          identifiers: [
            mailIdentifier("a@b.com"),
            { provider: MessagingProvider.linkedin, value: "handle" } as IdentifierInput,
          ],
        },
      ],
      new Map<string, string>(),
      ctx,
      () => ["identifiers"],
    );
    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it("lets an existing contact re-claim its own identifier under a sibling email provider", () => {
    const ctx = createMockCtx();
    const owners = new Map([["email:a@b.com", "contact-1"]]);
    validateIdentifierConflicts(
      [
        {
          selfContactId: "contact-1",
          identifiers: [{ provider: MessagingProvider.google, value: "a@b.com" } as IdentifierInput],
        },
      ],
      owners,
      ctx,
      () => ["identifiers"],
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
