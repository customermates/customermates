import type { Filter, FilterableField } from "../base-get.schema";

import { describe, expect, it, vi } from "vitest";

import { FilterOperatorKey } from "../base-query-builder";
import { QueryParamsPrecheckInteractor } from "../query-params-precheck.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";

const accountId = "00000000-0000-4000-8000-000000000001";
const folder = JSON.stringify([accountId, "folder:with/slashes"]);

function setup() {
  const validator = { invoke: vi.fn() };
  const precheck = new QueryParamsPrecheckInteractor(validator as never, validator as never, validator as never);
  const issues: unknown[] = [];
  const run = async (fields: FilterableField[], filters: Filter[]) => {
    await precheck.invoke({ filterableFields: fields, sortableFields: [] }, { filters }, {
      addIssue: (issue: unknown) => issues.push(issue),
    } as never);
    return issues;
  };
  return { run, validator };
}

const field = (key: string, values: string[]): FilterableField => ({
  field: key,
  operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
  options: values.map((value) => ({ value, label: null })),
});
const filter = (key: string, values: string[], exclude = false): Filter => ({
  field: key,
  operator: exclude ? FilterOperatorKey.notIn : FilterOperatorKey.in,
  value: values,
});

describe("caller-scoped filter options", () => {
  it("accepts accessible options, including an individually shared account, without broadening other account validators", async () => {
    const subject = setup();
    expect(
      await subject.run(
        [field("connectedAccountId", [accountId]), field("emailFolder", [folder])],
        [filter("connectedAccountId", [accountId]), filter("emailFolder", [folder], true)],
      ),
    ).toEqual([]);
    expect(subject.validator.invoke).not.toHaveBeenCalled();
  });

  it.each(["emailFolder", "connectedAccountId"])(
    "rejects unavailable %s values, including negative filters",
    async (key) => {
      for (const exclude of [false, true]) {
        const issues = await setup().run(
          [field(key, [])],
          [filter(key, [key === "emailFolder" ? folder : accountId], exclude)],
        );
        expect(issues).toEqual([
          expect.objectContaining({
            params: { error: CustomErrorCode.invalidFilterValue },
            path: ["filters", 0, "value", 0],
          }),
        ]);
      }
    },
  );

  it("keeps ordinary connected account validation when metadata has no scoped options", async () => {
    const subject = setup();
    expect(
      await subject.run(
        [{ field: "connectedAccountId", operators: [FilterOperatorKey.in] }],
        [filter("connectedAccountId", [accountId])],
      ),
    ).toEqual([]);
    expect(subject.validator.invoke).toHaveBeenCalledOnce();
  });

  it("still rejects an operator outside the field contract before checking options", async () => {
    const issues = await setup().run(
      [field("emailFolder", [folder])],
      [
        {
          field: "emailFolder",
          operator: FilterOperatorKey.contains,
          value: folder,
        },
      ],
    );
    expect(issues).toEqual([
      expect.objectContaining({
        params: expect.objectContaining({
          error: CustomErrorCode.invalidFilterOperator,
        }),
        path: ["filters", 0, "operator"],
      }),
    ]);
  });

  it("checks the last-message enum and last-activity date in the same precheck", async () => {
    const fields = [
      { field: "lastMessageDirection", operators: [FilterOperatorKey.in] },
      { field: "lastMessageAt", operators: [FilterOperatorKey.lt] },
    ];
    expect(
      await setup().run(fields, [
        filter("lastMessageDirection", ["inbound"]),
        {
          field: "lastMessageAt",
          operator: FilterOperatorKey.lt,
          value: "2026-09-30T10:00:00.000Z",
        },
      ]),
    ).toEqual([]);
    expect(
      await setup().run(fields, [
        filter("lastMessageDirection", ["draft"]),
        {
          field: "lastMessageAt",
          operator: FilterOperatorKey.lt,
          value: "tomorrow",
        },
      ]),
    ).toHaveLength(2);
  });

  it("accepts both relative bounds on the last actual message date while validating absolute dates", async () => {
    const fields = [
      {
        field: "lastMessageSentAt",
        operators: [FilterOperatorKey.inLastDays, FilterOperatorKey.notInLastDays, FilterOperatorKey.lt],
      },
    ];
    expect(
      await setup().run(fields, [
        { field: "lastMessageSentAt", operator: FilterOperatorKey.inLastDays, value: 7 },
        { field: "lastMessageSentAt", operator: FilterOperatorKey.notInLastDays, value: 3 },
      ]),
    ).toEqual([]);
    expect(
      await setup().run(fields, [{ field: "lastMessageSentAt", operator: FilterOperatorKey.lt, value: "tomorrow" }]),
    ).toHaveLength(1);
  });
});
