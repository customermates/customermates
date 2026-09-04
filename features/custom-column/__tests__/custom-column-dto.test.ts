import { describe, expect, it } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { toCustomColumnDto, toCustomColumnDtos } from "../custom-column.dto";

const COLUMN_ID = "77777777-7777-4777-8777-777777777777";

function stored(options: unknown) {
  return {
    id: COLUMN_ID,
    label: "Stage",
    entityType: EntityType.deal,
    type: CustomColumnType.singleSelect,
    options,
  };
}

function values(column: unknown): string[] {
  const stored = (column as { options?: { options?: Array<{ value: string }> } }).options?.options ?? [];

  return stored.map((option) => option.value);
}

const option = (value: string, index: number) => ({
  value,
  label: value,
  color: "success" as const,
  isDefault: false,
  index,
});

describe("a single select column DTO carries its options in ascending option index", () => {
  it("reorders stored array order into index order", () => {
    const dto = toCustomColumnDto(stored({ options: [option("c", 2), option("a", 0), option("b", 1)] }));

    expect(values(dto)).toEqual(["a", "b", "c"]);
  });

  it("breaks an index tie by stored array position", () => {
    const dto = toCustomColumnDto(stored({ options: [option("b", 1), option("a", 1), option("c", 0)] }));

    expect(values(dto)).toEqual(["c", "b", "a"]);
  });

  it("falls back to array position for an option with no index", () => {
    const dto = toCustomColumnDto(
      stored({ options: [{ value: "first" }, { value: "second" }, option("third", 5)] } as unknown),
    );

    expect(values(dto)).toEqual(["first", "second", "third"]);
  });

  it("returns a non single select column untouched", () => {
    const row = { id: COLUMN_ID, label: "Notes", entityType: EntityType.deal, type: CustomColumnType.plain };

    expect(toCustomColumnDto(row)).toBe(row);
  });

  it("does not throw on a null or malformed options payload", () => {
    expect(() => toCustomColumnDto(stored(null))).not.toThrow();
    expect(() => toCustomColumnDto(stored({ options: "nonsense" }))).not.toThrow();
    expect(() => toCustomColumnDto(stored(undefined))).not.toThrow();
  });

  it("maps a list through the same rule", () => {
    const [first, second] = toCustomColumnDtos([
      stored({ options: [option("b", 1), option("a", 0)] }),
      { id: COLUMN_ID, label: "Notes", entityType: EntityType.deal, type: CustomColumnType.plain },
    ]);

    expect(values(first)).toEqual(["a", "b"]);
    expect(second.type).toBe(CustomColumnType.plain);
  });
});
