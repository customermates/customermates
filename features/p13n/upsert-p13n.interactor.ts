import type { UpsertP13nRepo } from "./upsert-p13n.repo";
import type { P13nEntry } from "./prisma-p13n.repository";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { FilterSchema, SortDescriptorSchema, PaginationRequestSchema } from "@/core/base/base-get.schema";
import { ViewMode } from "@/core/base/base-query-builder";
import { GroupingSchema } from "@/core/base/grouping/grouping.schema";
import { EntityDetailOptionsSchema, P13nEntrySchema } from "./p13n.schema";
import { p13nSettingsSchema, type P13nSettings } from "./p13n-settings.schema";

const Schema = z
  .object({
    p13nId: z
      .string()
      .min(1)
      .refine(
        (value) => !value.startsWith("records:") && !value.startsWith("record-detail:"),
        "Record presentation requires the validated view or detail-layout operations",
      ),
    activeViewKey: z.string().nullish(),
    filters: z.array(FilterSchema).nullish(),
    searchTerm: z.string().nullish(),
    sortDescriptor: SortDescriptorSchema.nullish(),
    pagination: PaginationRequestSchema.pick({ pageSize: true }).nullish(),
    columnOrder: z.array(z.string()).nullish(),
    columnWidths: z.record(z.string(), z.number()).nullish(),
    hiddenColumns: z.array(z.string()).optional(),
    viewMode: z.enum(ViewMode).nullish(),
    grouping: GroupingSchema.nullish(),
    detailOptions: EntityDetailOptionsSchema.nullish(),
    settings: z.custom<P13nSettings>().nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.settings === undefined) return;
    const schema = p13nSettingsSchema(data.p13nId);
    if (!schema) {
      ctx.addIssue({ code: "custom", path: ["settings"], message: "Settings are not stored for this view" });
      return;
    }
    if (data.settings === null) return;
    for (const issue of schema.safeParse(data.settings).error?.issues ?? [])
      ctx.addIssue({ code: "custom", path: ["settings", ...issue.path], message: issue.message });
  });
export type UpsertP13nData = Data<typeof Schema>;

@TenantInteractor()
export class UpsertP13nInteractor extends AuthenticatedInteractor<UpsertP13nData, P13nEntry> {
  constructor(private repo: UpsertP13nRepo) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(P13nEntrySchema)
  async invoke(data: UpsertP13nData): Promise<{ ok: true; data: P13nEntry }> {
    return { ok: true as const, data: await this.repo.upsertP13n(data) };
  }
}
