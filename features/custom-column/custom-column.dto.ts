import type { CustomColumnDto } from "./custom-column.schema";

import { CustomColumnType } from "@/generated/prisma";

import { orderByOptionIndex } from "@/core/base/grouping/option-order";

type CustomColumnRow = { type: CustomColumnType; options?: unknown } & Record<string, unknown>;

export function toCustomColumnDto(row: CustomColumnRow): CustomColumnDto {
  if (row.type !== CustomColumnType.singleSelect) return row as unknown as CustomColumnDto;

  const stored = (row.options as { options?: unknown } | null | undefined)?.options;
  if (!Array.isArray(stored)) return row as unknown as CustomColumnDto;

  return { ...row, options: { options: orderByOptionIndex(stored) } } as unknown as CustomColumnDto;
}

export function toCustomColumnDtos(rows: readonly CustomColumnRow[]): CustomColumnDto[] {
  return rows.map(toCustomColumnDto);
}
