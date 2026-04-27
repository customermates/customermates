import { describe, it, expect } from "vitest";

import { BaseCreateContactSchema } from "../upsert/create-contact-base.schema";
import { BaseUpdateContactSchema } from "../upsert/update-contact-base.schema";

const VALID_UUID = "00000000-0000-4000-8000-000000000001";

describe("BaseCreateContactSchema", () => {
  it("accepts valid minimal data", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Jane");
      expect(result.data.lastName).toBe("Doe");
      expect(result.data.emails).toEqual([]);
      expect(result.data.organizationIds).toEqual([]);
      expect(result.data.userIds).toEqual([]);
      expect(result.data.dealIds).toEqual([]);
      expect(result.data.customFieldValues).toEqual([]);
    }
  });

  it("accepts a single valid email", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      emails: ["jane@example.com"],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.emails).toEqual(["jane@example.com"]);
  });

  it("accepts multiple valid emails (preserves order, first is primary)", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      emails: ["jane@acme.com", "jane.personal@gmail.com"],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.emails).toEqual(["jane@acme.com", "jane.personal@gmail.com"]);
  });

  it("accepts an empty emails array", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      emails: [],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.emails).toEqual([]);
  });

  it("defaults emails to empty array when omitted", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.emails).toEqual([]);
  });

  it("rejects array containing an invalid email", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      emails: ["jane@example.com", "not-an-email"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts full data with all optional fields", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      notes: "Some notes",
      organizationIds: [VALID_UUID],
      userIds: [VALID_UUID],
      dealIds: [VALID_UUID],
      customFieldValues: [{ columnId: VALID_UUID, value: "test" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty firstName", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing firstName", () => {
    const result = BaseCreateContactSchema.safeParse({
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID in organizationIds", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      organizationIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts null notes", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid customFieldValues structure", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      customFieldValues: [{ columnId: "not-a-uuid" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("BaseUpdateContactSchema", () => {
  it("accepts valid update with id only", () => {
    const result = BaseUpdateContactSchema.safeParse({
      id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("accepts update with emails array", () => {
    const result = BaseUpdateContactSchema.safeParse({
      id: VALID_UUID,
      emails: ["jane@example.com", "jane.alt@example.com"],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.emails).toEqual(["jane@example.com", "jane.alt@example.com"]);
  });

  it("accepts emails: [] to clear all emails", () => {
    const result = BaseUpdateContactSchema.safeParse({
      id: VALID_UUID,
      emails: [],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.emails).toEqual([]);
  });

  it("accepts emails: null to leave emails untouched", () => {
    const result = BaseUpdateContactSchema.safeParse({
      id: VALID_UUID,
      emails: null,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.emails).toBeNull();
  });

  it("rejects update with invalid email in array", () => {
    const result = BaseUpdateContactSchema.safeParse({
      id: VALID_UUID,
      emails: ["jane@example.com", "garbage"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts partial updates", () => {
    const result = BaseUpdateContactSchema.safeParse({
      id: VALID_UUID,
      firstName: "Updated",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Updated");
      expect(result.data.lastName).toBeUndefined();
    }
  });

  it("rejects missing id", () => {
    const result = BaseUpdateContactSchema.safeParse({
      firstName: "Updated",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid id", () => {
    const result = BaseUpdateContactSchema.safeParse({
      id: "not-a-uuid",
      firstName: "Updated",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null for nullable array fields", () => {
    const result = BaseUpdateContactSchema.safeParse({
      id: VALID_UUID,
      organizationIds: null,
      userIds: null,
      dealIds: null,
      customFieldValues: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty firstName when provided", () => {
    const result = BaseUpdateContactSchema.safeParse({
      id: VALID_UUID,
      firstName: "",
    });
    expect(result.success).toBe(false);
  });
});
