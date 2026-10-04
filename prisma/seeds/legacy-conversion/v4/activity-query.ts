import { z } from "zod";
import { presetId } from "../v2/contract/crm-preset";

const KINDS = ["audit", "message", "activity", "calendar_event"] as const;
const PROVIDERS = ["google", "outlook", "mail", "linkedin", "whatsapp", "instagram", "telegram"] as const;
const Operator = z.enum(["in", "notIn"]);
const Filter = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source"), operator: Operator, values: z.array(z.enum(KINDS)).min(1).max(4) }).strict(),
  z
    .object({ kind: z.literal("provider"), operator: Operator, values: z.array(z.enum(PROVIDERS)).min(1).max(7) })
    .strict(),
  z.object({ kind: z.literal("account"), operator: Operator, values: z.array(z.uuid()).min(1).max(50) }).strict(),
  z.object({ kind: z.literal("thread"), operator: Operator, values: z.array(z.uuid()).min(1).max(50) }).strict(),
  z
    .object({
      kind: z.literal("record"),
      typeId: z.uuid(),
      operator: z.enum(["in", "notIn", "hasSome", "hasNone"]),
      recordIds: z.array(z.uuid()).max(50),
    })
    .strict()
    .superRefine((filter, ctx) => {
      if ((filter.operator === "in" || filter.operator === "notIn") !== filter.recordIds.length > 0)
        ctx.addIssue({ code: "custom", path: ["recordIds"], message: "Invalid record selection" });
    }),
]);
export const MigratedActivityQuerySchema = z
  .object({
    scope: z
      .object({
        records: z.array(z.object({ typeId: z.uuid(), recordId: z.uuid() }).strict()).max(50),
        typeIds: z.array(z.uuid()).max(50),
      })
      .strict(),
    kinds: z.array(z.enum(KINDS)).min(1).max(4),
    filters: z.array(Filter).max(20),
  })
  .strict();
export type MigratedActivityQuery = z.infer<typeof MigratedActivityQuerySchema>;
const LegacyFilter = z
  .object({
    field: z.string(),
    operator: z.enum(["in", "notIn", "hasSome", "hasNone"]),
    value: z.array(z.string()).optional(),
  })
  .strict();
const RELATIONS: Record<string, string> = {
  contactIds: "contact",
  organizationIds: "organization",
  dealIds: "deal",
  serviceIds: "service",
  taskIds: "task",
};
const SOURCE_ALIASES: Record<string, readonly (typeof KINDS)[number][]> = {
  changes: ["audit"],
  messages: ["message"],
  activities: ["activity", "calendar_event"],
  audit: ["audit"],
  message: ["message"],
  activity: ["activity"],
  calendar_event: ["calendar_event"],
};

export function migrateActivityQuery(companyId: string, legacy: unknown): MigratedActivityQuery {
  const filters: z.infer<typeof Filter>[] = [];
  for (const filter of z
    .array(LegacyFilter)
    .max(20)
    .parse(legacy ?? [])) {
    const type = RELATIONS[filter.field];
    const presence = filter.operator === "hasSome" || filter.operator === "hasNone";
    if (presence && (!type || filter.value !== undefined)) throw new Error("Invalid presence filter");
    if (!presence && !filter.value?.length) throw new Error("An empty legacy filter needs explicit review");
    if (type) {
      filters.push({
        kind: "record",
        typeId: presetId(companyId, type),
        operator: filter.operator,
        recordIds: filter.value ?? [],
      });
      continue;
    }
    if (filter.operator !== "in" && filter.operator !== "notIn") throw new Error("Unsupported filter operator");
    const values = filter.value ?? [];
    if (filter.field === "timelineKind") {
      const kinds = values.flatMap((value) => {
        if (!SOURCE_ALIASES[value]) throw new Error("Unknown activity source");
        return SOURCE_ALIASES[value];
      });
      filters.push({ kind: "source", operator: filter.operator, values: [...new Set(kinds)] });
    } else if (filter.field === "provider") {
      if (filter.operator !== "in") throw new Error("Legacy provider exclusions were unsupported");
      filters.push({ kind: "provider", operator: "in", values: z.array(z.enum(PROVIDERS)).parse(values) });
    } else if (filter.field === "connectedAccountId" || filter.field === "timelineThreadId") {
      filters.push({
        kind: filter.field === "connectedAccountId" ? "account" : "thread",
        operator: filter.operator,
        values,
      });
    } else throw new Error("Unsupported legacy activity filter");
  }
  return MigratedActivityQuerySchema.parse({ scope: { records: [], typeIds: [] }, kinds: [...KINDS], filters });
}
