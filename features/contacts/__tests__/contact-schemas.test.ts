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
      expect(result.data.organizationIds).toEqual([]);
      expect(result.data.userIds).toEqual([]);
      expect(result.data.dealIds).toEqual([]);
      expect(result.data.taskIds).toEqual([]);
      expect(result.data.customFieldValues).toEqual([]);
    }
  });

  it("accepts full data with all optional fields", () => {
    const result = BaseCreateContactSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      notes: "Some notes",
      organizationIds: [VALID_UUID],
      userIds: [VALID_UUID],
      dealIds: [VALID_UUID],
      taskIds: [VALID_UUID],
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

  it("rejects empty id", () => {
    const result = BaseUpdateContactSchema.safeParse({
      id: "",
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
      taskIds: null,
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
