import { channelClass } from "@/ee/messaging/provider";
import { presetId } from "@/features/records/crm-preset";
import { identityKeys, normalizedIdentity } from "@/features/records/record-identity";
import type { RecordAddress, RecordModel, RecordScalar } from "@/features/records/record-model.schema";
import type { RecordIdentityProvider } from "@/generated/prisma";

import { fixtureId, workspaceFixtureId } from "../helpers";
import { TEAM_MEMBER_IDS } from "../team";
import { storyDay, storyMoment } from "../timeline";
import { zonedInstant } from "@/features/record-calendar/zoned-time";
import { unverifiedRecordAddress } from "@/features/records/record-address";
import {
  COLLEAGUE_KEYS,
  type AddressInput,
  type ColleagueKey,
  type FieldInput,
  type MemberKey,
  type RecordSpec,
  type SolutionContent,
} from "./define-solution";
import type { SolutionWorkspace } from "./solution-workspaces";

const STARTER_RECORD_PREFIXES: Record<string, string> = {
  contact: "60000000",
  organization: "70000000",
  deal: "80000000",
  service: "90000000",
  task: "a0000000",
  lineItem: "12000000",
};
export const SOLUTION_LINK_PREFIX = "5a000000";
export const SOLUTION_IDENTITY_PREFIX = "b0000000";
export const SOLUTION_RECORD_EVENT_PREFIX = "3a000000";

export type SolutionRecordRow = { typeKey: string; typeId: string; id: string; createdAt: Date; updatedAt: Date };
export type SolutionValueRow = { typeId: string; recordId: string; fieldId: string; value: RecordScalar };
export type SolutionLinkRow = {
  id: string;
  relationId: string;
  sourceTypeId: string;
  sourceId: string;
  targetTypeId: string;
  targetId: string;
};
export type SolutionAssignmentRow = { typeId: string; recordId: string; userId: string };
export type SolutionIdentityRow = {
  id: string;
  typeId: string;
  recordId: string;
  provider: RecordIdentityProvider;
  channelClass: string;
  value: string;
  messagingId: string | null;
  displayName: string | null;
  profileUrl: string | null;
  keys: string[];
};
export type SolutionHistoryEntry = {
  id: string;
  typeId: string;
  recordId: string;
  kind: "record.created" | "record.updated";
  at: Date;
  actorId: string;
  /** Created: the values at creation that differ from today. Updated: the values before the change. */
  values: Map<string, RecordScalar>;
};

export type SolutionRecordData = {
  records: SolutionRecordRow[];
  values: SolutionValueRow[];
  links: SolutionLinkRow[];
  assignments: SolutionAssignmentRow[];
  identities: SolutionIdentityRow[];
  history: SolutionHistoryEntry[];
  /** Record id by `<list>:<key>`, for links of conversations and fixtures. */
  ids: ReadonlyMap<string, { typeId: string; recordId: string }>;
};

export function solutionDocument(text: string | readonly string[]): string {
  const paragraphs = typeof text === "string" ? text.split("\n") : text;
  return JSON.stringify({
    type: "doc",
    content: paragraphs.map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  });
}

function isColleague(member: MemberKey): member is ColleagueKey {
  return (COLLEAGUE_KEYS as readonly string[]).includes(member);
}

/** The user id of a synthetic colleague in a non-team workspace. */
export function solutionColleagueId(workspace: SolutionWorkspace, colleague: ColleagueKey): string {
  return workspaceFixtureId("30000000", workspace.tag, COLLEAGUE_KEYS.indexOf(colleague) + 2);
}

/**
 * The member behind an owner or member value: team members in the team workspace, the workspace's own colleagues
 * elsewhere, and Max for every other key.
 */
export function solutionMemberId(workspace: SolutionWorkspace, member: MemberKey | undefined): string {
  if (!member) return workspace.memberId;
  if (isColleague(member)) {
    if (workspace.team) throw new Error("The team workspace has no colleagues besides its team");
    return solutionColleagueId(workspace, member);
  }
  if (!workspace.team) return workspace.memberId;
  return TEAM_MEMBER_IDS[member];
}

function recordPrefix(content: SolutionContent, list: string): string {
  const starter = STARTER_RECORD_PREFIXES[list];
  if (starter) return starter;
  const custom = content.lists.filter((entry) => !(entry.key in STARTER_RECORD_PREFIXES)).map((entry) => entry.key);
  const index = custom.indexOf(list);
  if (index < 0) throw new Error(`Records of unknown list ${list}`);
  return `4a${index + 1}00000`;
}

/** Every record id prefix a solution's records can use, for removing records the seed no longer writes. */
export function solutionRecordPrefixes(content: SolutionContent): Array<readonly [list: string, prefix: string]> {
  const lists = content.lists.map((list) => list.key);
  if (lists.includes("service")) lists.push("lineItem");
  return lists.map((list) => [list, recordPrefix(content, list)] as const);
}

type Story = Pick<SolutionContent, "currency" | "timeZone">;

function wallTime(text: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) throw new Error(`Local time ${text} is not HH:mm`);
  return { hour: Number(match[1]), minute: Number(match[2]), second: 0, millisecond: 0 };
}

/** The instant of a local time on a story day in the story's time zone. */
export function storyInstant(story: Pick<Story, "timeZone">, day: number, time: string): Date {
  return zonedInstant(storyDay(day), wallTime(time), story.timeZone);
}

function storyAddress(input: AddressInput): RecordAddress {
  const address = unverifiedRecordAddress({
    street: input.street,
    line2: input.line2 ?? null,
    postalCode: input.postalCode,
    city: input.city,
    region: input.region ?? null,
    countryCode: input.countryCode,
    formatted: "",
    location: null,
    verification: { status: "unverified", provider: null, checkedAt: null },
  });
  if (!address) throw new Error(`Address ${input.street} has no parts`);
  const round = (value: number) => Math.round(value * 1e5) / 1e5;
  return { ...address, location: { lat: round(input.lat), lon: round(input.lon), precision: "postcode" } };
}

const isObject = (input: FieldInput): input is Exclude<FieldInput, string | number | boolean | readonly string[]> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

function scalar(
  workspace: SolutionWorkspace,
  model: RecordModel,
  story: Story,
  fieldKey: string,
  input: FieldInput,
): RecordScalar {
  const id = (key: string) => presetId(workspace.companyId, key);
  const field = model.fields.find((candidate) => candidate.id === id(fieldKey));
  if (!field) throw new Error(`${workspace.slug}: unknown field ${fieldKey}`);
  if (field.behavior.kind !== "input") throw new Error(`${workspace.slug}: ${fieldKey} is calculated`);
  const fail = (): never => {
    throw new Error(`${workspace.slug}: ${JSON.stringify(input)} does not fit ${fieldKey} (${field.valueType})`);
  };
  const option = (key: string) => {
    const optionId = id(`${fieldKey}.${key}`);
    if (!field.options.some((candidate) => candidate.id === optionId)) fail();
    return optionId;
  };
  switch (field.valueType) {
    case "text":
    case "url":
      if (field.multiple && Array.isArray(input)) return { kind: "textList", value: [...(input as string[])] };
      return typeof input === "string" ? { kind: "text", value: input } : fail();
    case "richText":
      return typeof input === "string" || Array.isArray(input)
        ? { kind: "richText", documentJson: solutionDocument(input as string | string[]) }
        : fail();
    case "number":
      return typeof input === "number" ? { kind: "decimal", value: String(input), currency: null } : fail();
    case "currency":
      return typeof input === "number" ? { kind: "decimal", value: String(input), currency: story.currency } : fail();
    case "boolean":
      return typeof input === "boolean" ? { kind: "boolean", value: input } : fail();
    case "date":
      return isObject(input) && "day" in input && !("at" in input)
        ? { kind: "date", value: storyDay(input.day) }
        : fail();
    case "dateTime":
      return isObject(input) && "at" in input && !("minutes" in input)
        ? { kind: "dateTime", value: storyInstant(story, input.day, input.at).toISOString() }
        : fail();
    case "dateRange":
      return isObject(input) && "from" in input
        ? { kind: "range", start: storyDay(input.from), end: storyDay(input.to) }
        : fail();
    case "dateTimeRange": {
      if (!isObject(input) || !("minutes" in input)) return fail();
      const start = storyInstant(story, input.day, input.at);
      return {
        kind: "range",
        start: start.toISOString(),
        end: new Date(start.getTime() + input.minutes * 60_000).toISOString(),
      };
    }
    case "address":
      return isObject(input) && "postalCode" in input ? { kind: "address", value: storyAddress(input) } : fail();
    case "select":
      if (field.multiple) return Array.isArray(input) ? { kind: "selectList", value: input.map(option) } : fail();
      return typeof input === "string" ? { kind: "select", value: option(input) } : fail();
    case "member":
      return typeof input === "string"
        ? { kind: "member", value: solutionMemberId(workspace, input as MemberKey) }
        : fail();
    default:
      return fail();
  }
}

/**
 * Turns a solution's records into storage rows: deterministic ids per list (`fixtureId(prefix, position)`), field
 * values, relationship links, owners, channel identities and the record history (one creation per record plus its
 * authored updates). Dates are story days, so the whole workspace moves with the weekly timeline shift.
 */
export function buildSolutionRecordData(
  workspace: SolutionWorkspace,
  content: SolutionContent,
  model: RecordModel,
): SolutionRecordData {
  const id = (key: string) => presetId(workspace.companyId, key);
  const ids = new Map<string, { typeId: string; recordId: string }>();
  const lists = Object.entries(content.records);
  for (const [list, records] of lists) {
    if (list === "lineItem") throw new Error("Line items come from deal lines");
    const prefix = recordPrefix(content, list);
    for (const [index, record] of records.entries()) {
      const key = `${list}:${record.key}`;
      if (ids.has(key)) throw new Error(`${workspace.slug}: duplicate record ${key}`);
      ids.set(key, { typeId: id(list), recordId: fixtureId(prefix, index + 1) });
    }
  }
  const ref = (list: string, key: string) => {
    const found = ids.get(`${list}:${key}`);
    if (!found) throw new Error(`${workspace.slug}: unknown record ${list}:${key}`);
    return found;
  };

  const data: SolutionRecordData = {
    records: [],
    values: [],
    links: [],
    assignments: [],
    identities: [],
    history: [],
    ids,
  };
  const pendingHistory: Array<{ row: SolutionRecordRow; spec: RecordSpec; minutes: number }> = [];
  let lineIndex = 0;
  let minutes = 0;

  for (const [list, records] of lists) {
    for (const spec of records) {
      const { typeId, recordId } = ref(list, spec.key);
      minutes = (minutes + 47) % 420;
      const createdAt = storyMoment(spec.createdDaysAgo, minutes);
      const lastChange = spec.history?.at(-1);
      const updatedAt = lastChange ? storyMoment(lastChange.daysAgo, minutes) : createdAt;
      const row = { typeKey: list, typeId, id: recordId, createdAt, updatedAt };
      data.records.push(row);
      pendingHistory.push({ row, spec, minutes });
      for (const [fieldName, input] of Object.entries(spec.values)) {
        data.values.push({
          typeId,
          recordId,
          fieldId: id(`${list}.${fieldName}`),
          value: scalar(workspace, model, content, `${list}.${fieldName}`, input),
        });
      }
      if (spec.avatar) {
        data.values.push({
          typeId,
          recordId,
          fieldId: id("contact.avatarUrl"),
          value: { kind: "text", value: spec.avatar },
        });
      }
      if (spec.owner || workspace.team)
        data.assignments.push({ typeId, recordId, userId: solutionMemberId(workspace, spec.owner) });

      for (const [relationKey, targets] of Object.entries(spec.links ?? {})) {
        const relation = model.relationships.find((candidate) => candidate.id === id(relationKey));
        if (!relation) throw new Error(`${workspace.slug}: unknown relationship ${relationKey}`);
        const outgoing = relation.sourceTypeId === typeId;
        if (!outgoing && relation.targetTypeId !== typeId)
          throw new Error(`${workspace.slug}: ${relationKey} does not connect ${list}`);
        const otherType = outgoing ? relation.targetTypeId : relation.sourceTypeId;
        const otherList = model.types.find((type) => type.id === otherType);
        const otherKey = content.lists.find((entry) => id(entry.key) === otherList?.id)?.key;
        if (!otherKey) throw new Error(`${workspace.slug}: ${relationKey} links an unknown list`);
        for (const target of typeof targets === "string" ? [targets] : targets) {
          const other = ref(otherKey, target);
          data.links.push({
            id: fixtureId(SOLUTION_LINK_PREFIX, data.links.length + 1),
            relationId: relation.id,
            ...(outgoing
              ? { sourceTypeId: typeId, sourceId: recordId, targetTypeId: other.typeId, targetId: other.recordId }
              : { sourceTypeId: other.typeId, sourceId: other.recordId, targetTypeId: typeId, targetId: recordId }),
          });
        }
      }

      for (const [serviceKey, quantity] of spec.lines ?? []) {
        if (list !== "deal") throw new Error(`${workspace.slug}: only deals have line items`);
        const service = ref("service", serviceKey);
        const serviceName = content.records.service?.find((entry) => entry.key === serviceKey)?.values.name;
        lineIndex += 1;
        const lineId = fixtureId(STARTER_RECORD_PREFIXES.lineItem, lineIndex);
        const lineType = id("lineItem");
        data.records.push({ typeKey: "lineItem", typeId: lineType, id: lineId, createdAt, updatedAt: createdAt });
        data.values.push(
          {
            typeId: lineType,
            recordId: lineId,
            fieldId: id("lineItem.name"),
            value: { kind: "text", value: String(serviceName) },
          },
          {
            typeId: lineType,
            recordId: lineId,
            fieldId: id("lineItem.quantity"),
            value: { kind: "decimal", value: String(quantity), currency: null },
          },
          {
            typeId: lineType,
            recordId: lineId,
            fieldId: id("lineItem.pricingMode"),
            value: { kind: "select", value: "live" },
          },
        );
        for (const [relation, target] of [
          ["lineItem.deal", { typeId, recordId }],
          ["lineItem.service", service],
        ] as const) {
          data.links.push({
            id: fixtureId(SOLUTION_LINK_PREFIX, data.links.length + 1),
            relationId: id(relation),
            sourceTypeId: lineType,
            sourceId: lineId,
            targetTypeId: target.typeId,
            targetId: target.recordId,
          });
        }
      }

      const name =
        list === "contact"
          ? `${String(spec.values.firstName)} ${String(spec.values.lastName)}`
          : String(spec.values.name);
      const channels: Array<[RecordIdentityProvider, string | undefined, string | undefined]> = [
        ["mail", spec.channels?.email, undefined],
        ["linkedin", spec.channels?.linkedin, spec.channels?.linkedinUrl],
        ["phone", spec.channels?.phone, undefined],
      ];
      for (const [provider, raw, profileUrl] of channels) {
        if (!raw) continue;
        const normalized = normalizedIdentity({
          provider,
          value: raw,
          messagingId: provider === "linkedin" ? `demo-linkedin-${spec.key}` : null,
        });
        const value = normalized?.value ?? raw;
        const messagingId = normalized ? (normalized.messagingId ?? null) : null;
        data.identities.push({
          id: fixtureId(SOLUTION_IDENTITY_PREFIX, data.identities.length + 1),
          typeId,
          recordId,
          provider,
          channelClass: channelClass(provider),
          value,
          messagingId,
          displayName: provider === "mail" ? null : name,
          profileUrl: profileUrl ?? null,
          keys: identityKeys({ value, messagingId }),
        });
      }
    }
  }

  for (const { row, spec, minutes: offset } of pendingHistory) {
    const list = row.typeKey;
    const changes = spec.history ?? [];
    const firstValues = new Map<string, RecordScalar>();
    for (const change of changes) {
      for (const [fieldName, input] of Object.entries(change.previous)) {
        const fieldId = id(`${list}.${fieldName}`);
        if (!firstValues.has(fieldId))
          firstValues.set(fieldId, scalar(workspace, model, content, `${list}.${fieldName}`, input));
      }
    }
    data.history.push({
      id: fixtureId(SOLUTION_RECORD_EVENT_PREFIX, data.history.length + 1),
      typeId: row.typeId,
      recordId: row.id,
      kind: "record.created",
      at: row.createdAt,
      actorId: solutionMemberId(workspace, spec.owner),
      values: firstValues,
    });
    for (const change of changes) {
      data.history.push({
        id: fixtureId(SOLUTION_RECORD_EVENT_PREFIX, data.history.length + 1),
        typeId: row.typeId,
        recordId: row.id,
        kind: "record.updated",
        at: storyMoment(change.daysAgo, offset),
        actorId: solutionMemberId(workspace, change.by ?? spec.owner),
        values: new Map(
          Object.entries(change.previous).map(([fieldName, input]) => [
            id(`${list}.${fieldName}`),
            scalar(workspace, model, content, `${list}.${fieldName}`, input),
          ]),
        ),
      });
    }
  }
  return data;
}
