import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mode = vi.hoisted(() => ({ value: "cloud" as string }));
const mockUser = createMockUser({
  id: "00000000-0000-4000-8000-000000000010",
  companyId: "00000000-0000-4000-8000-000000000011",
});

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    get APP_MODE() {
      return mode.value;
    },
  },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import type { RecordModelView } from "@/features/records/record-model.schema";
import type { ComposeModelCall, ComposeModelOutcome } from "../compose-model-caller";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { ComposeModelCaller } from "../compose-model-caller";
import { ComposeAutomationInteractor } from "../compose-automation.interactor";
import { COMPOSE_MODEL_MAX_CHARS, compactRecordModel, composeSystemPrompt } from "../compose-automation.prompt";

const DEALS = "11111111-1111-4111-8111-111111111111";
const TASKS = "11111111-1111-4111-8111-222222222222";
const STAGE = "22222222-2222-4222-8222-222222222222";
const TITLE = "22222222-2222-4222-8222-444444444444";
const NOW = new Date("2026-11-16T09:00:00.000Z");

const MODEL = {
  revision: 1,
  types: [
    { id: DEALS, label: "Deal", archived: false, embedded: false, position: 0, primaryFieldId: null },
    { id: TASKS, label: "Action", archived: false, embedded: false, position: 1, primaryFieldId: TITLE },
  ],
  fields: [
    {
      id: STAGE,
      typeId: DEALS,
      label: "Stage",
      valueType: "select",
      behavior: { kind: "input" },
      archived: false,
      required: false,
      position: 0,
      options: [
        { id: "offer", label: "Offer sent" },
        { id: "won", label: "Won" },
      ],
    },
    {
      id: TITLE,
      typeId: TASKS,
      label: "Title",
      valueType: "text",
      behavior: { kind: "input" },
      archived: false,
      required: false,
      position: 0,
      options: [],
    },
  ],
  relationships: [],
} as unknown as RecordModelView;

class FakeCaller extends ComposeModelCaller {
  calls: ComposeModelCall<unknown>[] = [];
  constructor(
    private readonly output: unknown,
    private readonly refusal: "credits" | "unavailable" = "unavailable",
  ) {
    super();
  }
  call<T>(call: ComposeModelCall<T>): Promise<ComposeModelOutcome<T>> {
    this.calls.push(call as ComposeModelCall<unknown>);
    return Promise.resolve(
      this.output === null ? { ok: false, reason: this.refusal } : { ok: true, value: this.output as T },
    );
  }
}

const NOTIFY = {
  kind: "notify",
  recipients: { ruleOwner: true, assignees: false, userIds: [] },
  notificationKind: "ruleAlert",
  title: "{{record.name}}",
};

const DRAFT = {
  status: "draft",
  draft: {
    name: "Offer follow-up",
    trigger: { kind: "fieldChanged", typeId: DEALS, fieldId: STAGE, to: { kind: "select", value: "offer" } },
    conditions: [],
    effects: [NOTIFY],
  },
};

function build(
  output: unknown,
  entitlement: unknown = null,
  options: { refusal?: "credits" | "unavailable"; admit?: boolean } = {},
) {
  const caller = new FakeCaller(output, options.refusal);
  const entitlements = { require: vi.fn().mockResolvedValue(entitlement) };
  const records = { model: vi.fn().mockResolvedValue(MODEL) };
  const limiter = { admit: vi.fn().mockReturnValue({ allowed: options.admit ?? true }) };
  const interactor = new ComposeAutomationInteractor(records, entitlements as never, caller, () => NOW, limiter);
  const compose = (sentence: string) => runWithTenant(mockUser, () => interactor.invoke({ sentence }));
  return { caller, entitlements, records, limiter, compose };
}

describe("composing an automation with Mate", () => {
  beforeEach(() => {
    mode.value = "cloud";
  });

  it("returns a validated draft and writes nothing", async () => {
    const { compose, records } = build(DRAFT);
    const result = await compose("When a deal moves to Offer sent, notify me");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      status: "draft",
      draft: { name: "Offer follow-up", enabled: true, effects: [NOTIFY] },
    });
    expect(records.model).toHaveBeenCalledOnce();
  });

  it("sends the workspace model, today and the sentence to the model", async () => {
    const { compose, caller } = build(DRAFT);
    await compose("Remind me about renewals");
    const call = caller.calls[0];
    expect(call?.system).toContain("Today is 2026-11-16.");
    expect(call?.system).toContain(DEALS);
    expect(call?.system).toContain("Offer sent");
    expect(call?.prompt).toContain("Remind me about renewals");
  });

  it("runs every agent step on Mate whatever the model asked for", async () => {
    const draft = {
      ...DRAFT,
      draft: {
        ...DRAFT.draft,
        effects: [{ kind: "agent", runtime: "runner", prompt: "Draft a reply", model: "x", runnerId: "r" }],
      },
    };
    const result = await build(draft).compose("Draft replies");
    expect(result.ok && result.data.status === "draft" ? result.data.draft.effects : null).toEqual([
      { kind: "agent", runtime: "mate", prompt: "Draft a reply" },
    ]);
  });

  it("refuses a draft that points at a field the workspace does not have", async () => {
    const invalid = {
      ...DRAFT,
      draft: {
        ...DRAFT.draft,
        trigger: { ...DRAFT.draft.trigger, fieldId: "99999999-9999-4999-8999-999999999999" },
      },
    };
    const result = await build(invalid).compose("Anything");
    expect(result).toEqual({ ok: true, data: { status: "refused", reason: "invalid" } });
  });

  it("passes on the model's refusal reasons", async () => {
    const unclear = await build({ status: "refused", reason: "unclear" }).compose("Do things");
    const unsupported = await build({ status: "refused", reason: "unsupported" }).compose("Wait 3 days");
    expect(unclear).toEqual({ ok: true, data: { status: "refused", reason: "unclear" } });
    expect(unsupported).toEqual({ ok: true, data: { status: "refused", reason: "unsupported" } });
  });

  it("reports the assistant as unavailable when the model returns nothing", async () => {
    const result = await build(null).compose("Anything");
    expect(result).toEqual({ ok: true, data: { status: "refused", reason: "unavailable" } });
  });

  it("passes on a credits refusal from the hosted caller", async () => {
    const result = await build(null, null, { refusal: "credits" }).compose("Anything");
    expect(result).toEqual({ ok: true, data: { status: "refused", reason: "credits" } });
  });

  it("refuses a member who composed too often in the last hour before the model is called", async () => {
    const { compose, caller, limiter, records } = build(DRAFT, null, { admit: false });
    expect(await compose("Anything")).toEqual({ ok: true, data: { status: "refused", reason: "rateLimited" } });
    expect(limiter.admit).toHaveBeenCalledWith(`${mockUser.companyId}:${mockUser.id}`);
    expect(caller.calls).toHaveLength(0);
    expect(records.model).not.toHaveBeenCalled();
  });

  it("is unavailable on self-hosted, without calling the model", async () => {
    mode.value = "self-hosted";
    const { compose, caller, entitlements } = build(DRAFT);
    expect(await compose("Anything")).toEqual({ ok: true, data: { status: "refused", reason: "unavailable" } });
    expect(caller.calls).toHaveLength(0);
    expect(entitlements.require).not.toHaveBeenCalled();
  });

  it("stops at the agent chat entitlement before spending anything", async () => {
    const denial = { ok: false, error: { issues: [] } };
    const { compose, caller, records } = build(DRAFT, denial);
    expect(await compose("Anything")).toBe(denial);
    expect(caller.calls).toHaveLength(0);
    expect(records.model).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized sentence", async () => {
    const { compose } = build(DRAFT);
    expect((await compose("   ")).ok).toBe(false);
    expect((await compose("x".repeat(601))).ok).toBe(false);
  });
});

describe("the composer prompt", () => {
  it("lists only live lists, their fields and options", () => {
    const compact = compactRecordModel({
      ...MODEL,
      types: [...MODEL.types, { id: "arch", label: "Old", archived: true, embedded: false, position: 3 }],
    } as unknown as RecordModelView);
    expect(compact.lists.map((list) => list.label)).toEqual(["Deal", "Action"]);
    expect(compact.lists[0]?.fields[0]).toMatchObject({
      id: STAGE,
      options: [
        { id: "offer", label: "Offer sent" },
        { id: "won", label: "Won" },
      ],
    });
    expect(composeSystemPrompt(MODEL, "2026-11-16")).toContain("never invent an id");
  });

  function largeModel(lists: number, fields: number, options: number): RecordModelView {
    const id = (kind: string, ...parts: number[]) => `${kind}-${parts.join("-")}-0000-4000-8000-000000000000`;
    return {
      revision: 1,
      types: Array.from({ length: lists }, (_unused, list) => ({
        id: id("list", list),
        label: `List number ${list} with a descriptive name`,
        archived: false,
        embedded: false,
        position: list,
        primaryFieldId: null,
      })),
      fields: Array.from({ length: lists * fields }, (_unused, index) => {
        const list = Math.floor(index / fields);
        const field = index % fields;
        return {
          id: id("field", list, field),
          typeId: id("list", list),
          label: `Field number ${field} of list ${list}`,
          valueType: "select",
          behavior: { kind: "input" },
          archived: false,
          required: false,
          position: field,
          options: Array.from({ length: options }, (_option, option) => ({
            id: id("option", list, field, option),
            label: `Choice ${option}`,
          })),
        };
      }),
      relationships: [],
    } as unknown as RecordModelView;
  }

  it("keeps a workspace with many lists, fields and options inside the character limit instead of sending it whole", () => {
    const heavy = largeModel(30, 60, 40);
    const unbounded = compactRecordModel(heavy, Number.MAX_SAFE_INTEGER);
    expect(JSON.stringify(unbounded).length).toBeGreaterThan(1_000_000);
    expect(unbounded.lists[0]?.fields[0]?.options).toHaveLength(40);

    const compact = compactRecordModel(heavy);

    expect(JSON.stringify(compact).length).toBeLessThanOrEqual(COMPOSE_MODEL_MAX_CHARS);
    expect(JSON.stringify(compact).length).toBeGreaterThan(COMPOSE_MODEL_MAX_CHARS * 0.9);
    expect(compact.lists).toHaveLength(30);
    expect(compact.lists.every((list) => list.fields.length >= 10)).toBe(true);
    expect(compact.lists[0]?.fields[0]?.options).toBeUndefined();
    expect(composeSystemPrompt(heavy, "2026-11-16").length).toBeLessThan(COMPOSE_MODEL_MAX_CHARS + 2_500);
  });

  it("gives up options before fields and fields before lists, and keeps a small workspace whole", () => {
    const medium = largeModel(10, 30, 20);
    const compact = compactRecordModel(medium);

    expect(JSON.stringify(compact).length).toBeLessThanOrEqual(COMPOSE_MODEL_MAX_CHARS);
    expect(compact.lists).toHaveLength(10);
    expect(compact.lists[0]?.fields).toHaveLength(30);
    expect(compact.lists[0]?.fields[0]?.options?.length ?? 0).toBeLessThan(20);

    const small = compactRecordModel(largeModel(3, 5, 4));
    expect(small.lists).toHaveLength(3);
    expect(small.lists[0]?.fields).toHaveLength(5);
    expect(small.lists[0]?.fields[0]?.options).toHaveLength(4);
  });

  it("clips a label of unreasonable length and still fits a tiny limit", () => {
    const long = {
      ...MODEL,
      types: [{ ...MODEL.types[0], label: "L".repeat(5_000) }, MODEL.types[1]],
    } as unknown as RecordModelView;

    expect(compactRecordModel(long).lists[0]?.label).toHaveLength(120);
    const tiny = compactRecordModel(largeModel(30, 60, 40), 4_000);
    expect(JSON.stringify(tiny).length).toBeLessThanOrEqual(4_000);
    expect(tiny.lists.length).toBeGreaterThan(1);
    expect(tiny.lists.every((list) => list.fields.length === 4)).toBe(true);
  });
});
