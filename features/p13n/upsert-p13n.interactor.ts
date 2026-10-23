import type { UpsertP13nRepo } from "./upsert-p13n.repo";
import type { P13nEntry } from "./prisma-p13n.repository";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { FilterSchema, SortDescriptorSchema, PaginationRequestSchema } from "@/core/base/base-get.schema";
import { ViewMode } from "@/core/base/base-query-builder";
import { GroupingSchema } from "@/core/base/grouping/grouping.schema";
import { EntityDetailOptionsSchema, P13nEntrySchema } from "./p13n.schema";
import { p13nSettingsSchema, type P13nSettings } from "./p13n-settings.schema";
import { isWritableP13nId, P13N_ID_MAX_LENGTH } from "./writable-p13n-id";

const P13N_KEY_MAX_LENGTH = 200;
const P13N_SEARCH_MAX_LENGTH = 500;
const P13N_FILTERS_MAX = 50;
const P13N_COLUMNS_MAX = 500;
const P13N_COLUMN_WIDTH_MAX = 10_000;

const Schema = z
  .object({
    p13nId: z
      .string()
      .min(1)
      .max(P13N_ID_MAX_LENGTH)
      .refine(isWritableP13nId, "This personalization cannot be stored here"),
    activeViewKey: z.string().max(P13N_KEY_MAX_LENGTH).nullish(),
    filters: z.array(FilterSchema).max(P13N_FILTERS_MAX).nullish(),
    searchTerm: z.string().max(P13N_SEARCH_MAX_LENGTH).nullish(),
    sortDescriptor: SortDescriptorSchema.nullish(),
    pagination: PaginationRequestSchema.pick({ pageSize: true }).nullish(),
    columnOrder: z.array(z.string().min(1).max(P13N_KEY_MAX_LENGTH)).max(P13N_COLUMNS_MAX).nullish(),
    columnWidths: z
      .record(z.string().min(1).max(P13N_KEY_MAX_LENGTH), z.number().finite().min(0).max(P13N_COLUMN_WIDTH_MAX))
      .refine((widths) => Object.keys(widths).length <= P13N_COLUMNS_MAX, "Too many column widths")
      .nullish(),
    hiddenColumns: z.array(z.string().min(1).max(P13N_KEY_MAX_LENGTH)).max(P13N_COLUMNS_MAX).optional(),
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

  @Validate(Schema)
  @ValidateOutput(P13nEntrySchema)
  async invoke(data: UpsertP13nData): Validated<P13nEntry> {
    return { ok: true as const, data: await this.repo.upsertP13n(data) };
  }
}
