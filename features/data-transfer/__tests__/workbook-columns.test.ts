import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { describe, expect, it } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

import {
  DATE_NUMBER_FORMAT,
  DATE_TIME_NUMBER_FORMAT,
  buildExportColumns,
  buildSchemaSheetRows,
  numberFormatFor,
  RANGE_SEPARATOR,
  RECORD_ID_COLUMN_KEY,
  resolveCustomFieldCell,
} from "../workbook-columns";

const STATUS_A = "aaaa1111-0000-4000-8000-00000000000a";
const STATUS_B = "bbbb2222-0000-4000-8000-00000000000b";
const QUALIFIED_OPTION = "11111111-0000-4000-8000-000000000001";
const CHURNED_OPTION = "22222222-0000-4000-8000-000000000002";

function singleSelect(id: string, label: string): CustomColumnDto {
  return {
    id,
    label,
    entityType: EntityType.contact,
    type: CustomColumnType.singleSelect,
    options: {
      options: [
        { value: QUALIFIED_OPTION, label: "Qualified", color: "success", isDefault: false, index: 0 },
        { value: CHURNED_OPTION, label: "Churned", color: "destructive", isDefault: false, index: 1 },
      ],
    },
  };
}

describe("buildExportColumns", () => {
  it("puts a hidden record id first so a human never sees a uuid but a re-import can find one", () => {
    const columns = buildExportColumns([{ key: "name", header: "Name" }], []);

    expect(columns[0]).toMatchObject({ key: RECORD_ID_COLUMN_KEY, header: "ID", hidden: true });
    expect(columns[1]).toMatchObject({ key: "name", header: "Name", hidden: false });
  });

  it("preserves the requested order, so custom columns stay where the table puts them", () => {
    const status = singleSelect(STATUS_A, "Status");
    const columns = buildExportColumns(
      [
        { key: "name", header: "Name" },
        { key: STATUS_A, header: "Status" },
        { key: "updatedAt", header: "Updated at" },
      ],
      [status],
    );

    expect(columns.map((column) => column.key)).toEqual([RECORD_ID_COLUMN_KEY, "name", STATUS_A, "updatedAt"]);
  });

  it("attaches the definition to a requested key that names a custom column", () => {
    const status = singleSelect(STATUS_A, "Status");
    const columns = buildExportColumns([{ key: STATUS_A, header: "Status" }], [status]);

    expect(columns[1].customColumn).toBe(status);
  });

  it("leaves a standard column without a definition", () => {
    const columns = buildExportColumns([{ key: "name", header: "Name" }], [singleSelect(STATUS_A, "Status")]);

    expect(columns[1].customColumn).toBeUndefined();
  });

  it("takes the header from the caller, because only the client can resolve a translated label", () => {
    const columns = buildExportColumns([{ key: STATUS_A, header: "Lebenszyklus" }], [singleSelect(STATUS_A, "Status")]);

    expect(columns[1].header).toBe("Lebenszyklus");
  });

  it("keeps both columns when two custom columns share a label", () => {
    const customColumns = [singleSelect(STATUS_A, "Status"), singleSelect(STATUS_B, "Status")];
    const columns = buildExportColumns(
      [
        { key: STATUS_A, header: "Status" },
        { key: STATUS_B, header: "Status" },
      ],
      customColumns,
    );

    expect(columns.map((column) => column.header)).toEqual(["ID", "Status", "Status"]);
    expect(columns[1].customColumn?.id).not.toBe(columns[2].customColumn?.id);
  });
});

describe("buildSchemaSheetRows", () => {
  it("keys duplicate labels by position so an importer can tell them apart", () => {
    const customColumns = [singleSelect(STATUS_A, "Status"), singleSelect(STATUS_B, "Status")];
    const rows = buildSchemaSheetRows(
      buildExportColumns(
        [
          { key: "name", header: "Name" },
          { key: STATUS_A, header: "Status" },
          { key: STATUS_B, header: "Status" },
        ],
        customColumns,
      ),
    );

    const statusRows = rows.filter((row) => row.customColumnId !== "");

    expect(statusRows).toHaveLength(2);
    expect(statusRows[0]).toMatchObject({ position: 3, header: "Status", customColumnId: STATUS_A });
    expect(statusRows[1]).toMatchObject({ position: 4, header: "Status", customColumnId: STATUS_B });
  });

  it("records the option ids next to their labels so a re-import can resolve a renamed option", () => {
    const rows = buildSchemaSheetRows(
      buildExportColumns([{ key: STATUS_A, header: "Status" }], [singleSelect(STATUS_A, "Status")]),
    );

    expect(rows[1].optionValues).toBe(`${QUALIFIED_OPTION},${CHURNED_OPTION}`);
    expect(rows[1].optionLabels).toBe("Qualified,Churned");
  });

  it("describes standard columns too, so a re-import never has to guess from a renamed header", () => {
    const rows = buildSchemaSheetRows(buildExportColumns([{ key: "name", header: "Vor- und Nachname" }], []));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ position: 1, key: RECORD_ID_COLUMN_KEY, customColumnId: "" });
    expect(rows[1]).toMatchObject({ position: 2, key: "name", header: "Vor- und Nachname", customColumnId: "" });
  });
});

describe("resolveCustomFieldCell", () => {
  it("resolves a single select to its option label rather than the stored uuid", () => {
    const column = singleSelect(STATUS_A, "Status");
    const cell = resolveCustomFieldCell(column, [{ columnId: STATUS_A, value: QUALIFIED_OPTION }]);

    expect(cell).toBe("Qualified");
  });

  it("returns null when the stored option no longer exists, matching what the table shows", () => {
    const column = singleSelect(STATUS_A, "Status");
    const cell = resolveCustomFieldCell(column, [
      { columnId: STATUS_A, value: "33333333-0000-4000-8000-000000000003" },
    ]);

    expect(cell).toBeNull();
  });

  it("never returns a value belonging to a different column", () => {
    const column = singleSelect(STATUS_A, "Status");
    const cell = resolveCustomFieldCell(column, [{ columnId: STATUS_B, value: QUALIFIED_OPTION }]);

    expect(cell).toBeNull();
  });

  it("emits currency as a number so the reader's locale formats it", () => {
    const column = {
      id: STATUS_A,
      label: "Deal value",
      entityType: EntityType.contact,
      type: CustomColumnType.currency,
      options: { currency: "eur" },
    } as CustomColumnDto;

    expect(resolveCustomFieldCell(column, [{ columnId: STATUS_A, value: "12500.50" }])).toBe(12500.5);
    expect(resolveCustomFieldCell(column, [{ columnId: STATUS_A, value: "not-a-number" }])).toBeNull();
  });

  it("emits a date as a Date so the reader's locale formats it", () => {
    const column = {
      id: STATUS_A,
      label: "Renewal",
      entityType: EntityType.contact,
      type: CustomColumnType.date,
      options: null,
    } as CustomColumnDto;

    const cell = resolveCustomFieldCell(column, [{ columnId: STATUS_A, value: "2026-11-04" }]);

    expect(cell).toBeInstanceOf(Date);
    expect((cell as Date).toISOString()).toBe("2026-11-04T00:00:00.000Z");
  });

  it("normalizes a stored range into an unambiguous iso pair", () => {
    const column = {
      id: STATUS_A,
      label: "Window",
      entityType: EntityType.contact,
      type: CustomColumnType.dateRange,
      options: null,
    } as CustomColumnDto;

    const cell = resolveCustomFieldCell(column, [{ columnId: STATUS_A, value: "2026-01-01,2026-03-01" }]);

    expect(cell).toBe(`2026-01-01T00:00:00.000Z${RANGE_SEPARATOR}2026-03-01T00:00:00.000Z`);
  });

  it("treats a missing, null or empty stored value as an empty cell", () => {
    const column = singleSelect(STATUS_A, "Status");

    expect(resolveCustomFieldCell(column, [])).toBeNull();
    expect(resolveCustomFieldCell(column, [{ columnId: STATUS_A, value: null }])).toBeNull();
    expect(resolveCustomFieldCell(column, [{ columnId: STATUS_A, value: "" }])).toBeNull();
  });

  it("passes a plain value through unchanged", () => {
    const column = {
      id: STATUS_A,
      label: "Reference",
      entityType: EntityType.contact,
      type: CustomColumnType.plain,
    } as CustomColumnDto;

    expect(resolveCustomFieldCell(column, [{ columnId: STATUS_A, value: "ACME-42" }])).toBe("ACME-42");
  });
});

describe("numberFormatFor", () => {
  it("gives the standard timestamps a format that shows the time", () => {
    expect(numberFormatFor("updatedAt", undefined)).toBe(DATE_TIME_NUMBER_FORMAT);
    expect(numberFormatFor("createdAt", undefined)).toBe(DATE_TIME_NUMBER_FORMAT);
  });

  it("matches the custom column type, date-only staying date-only", () => {
    const WHEN = "cccc3333-0000-4000-8000-00000000000c";

    const dateTimeColumn: CustomColumnDto = {
      id: WHEN,
      label: "When",
      entityType: EntityType.contact,
      type: CustomColumnType.dateTime,
    };

    const dateColumn: CustomColumnDto = {
      id: WHEN,
      label: "When",
      entityType: EntityType.contact,
      type: CustomColumnType.date,
    };

    expect(numberFormatFor(WHEN, dateTimeColumn)).toBe(DATE_TIME_NUMBER_FORMAT);
    expect(numberFormatFor(WHEN, dateColumn)).toBe(DATE_NUMBER_FORMAT);
  });

  it("leaves alone every column whose cell is not a Date, ranges included", () => {
    const ranged: CustomColumnDto = {
      id: "dddd4444-0000-4000-8000-00000000000d",
      label: "Window",
      entityType: EntityType.contact,
      type: CustomColumnType.dateTimeRange,
    };

    expect(numberFormatFor("name", undefined)).toBeUndefined();
    expect(numberFormatFor("dddd4444-0000-4000-8000-00000000000d", ranged)).toBeUndefined();
  });
});
