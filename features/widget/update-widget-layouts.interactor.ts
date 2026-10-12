import type { UpdateWidgetLayoutsRepo } from "./update-widget-layouts.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { WidgetLayoutSchema } from "./widget.schema";
import { WIDGET_GRID_BREAKPOINT_COLUMNS, WIDGET_GRID_MAX_ROW } from "./widget-grid";

import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";

function breakpointPlacements(columns: number) {
  const item = z
    .object({
      i: z.uuid().describe("Widget id."),
      x: z
        .number()
        .int()
        .min(0)
        .max(columns - 1)
        .describe(`Column from the left edge, 0 to ${columns - 1}.`),
      y: z.number().int().min(0).max(WIDGET_GRID_MAX_ROW).describe("Row from the top, in rows of 124 px."),
      w: z.number().int().min(1).max(columns).describe(`Width in columns, 1 to ${columns}.`),
      h: z.number().int().min(1).max(WIDGET_GRID_MAX_ROW).describe("Height in rows of 124 px."),
    })
    .strict()
    .refine((value) => value.x + value.w <= columns, {
      path: ["w"],
      message: `The widget must fit the ${columns}-column grid: x + w can be at most ${columns}.`,
    });
  return z.array(item).max(500);
}

export const UpdateWidgetLayoutsSchema = z
  .object({
    layouts: z
      .object({
        xs: breakpointPlacements(WIDGET_GRID_BREAKPOINT_COLUMNS.xs),
        sm: breakpointPlacements(WIDGET_GRID_BREAKPOINT_COLUMNS.sm),
        md: breakpointPlacements(WIDGET_GRID_BREAKPOINT_COLUMNS.md),
        lg: breakpointPlacements(WIDGET_GRID_BREAKPOINT_COLUMNS.lg),
      })
      .strict(),
  })
  .strict();
export type UpdateWidgetLayoutsData = Data<typeof UpdateWidgetLayoutsSchema>;

export const SavedWidgetLayoutSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  layout: WidgetLayoutSchema,
});
export type SavedWidgetLayout = Data<typeof SavedWidgetLayoutSchema>;

@TenantInteractor()
export class UpdateWidgetLayoutsInteractor extends AuthenticatedInteractor<
  UpdateWidgetLayoutsData,
  SavedWidgetLayout[]
> {
  constructor(private repo: UpdateWidgetLayoutsRepo) {
    super();
  }

  @Validate(UpdateWidgetLayoutsSchema)
  async invoke(data: UpdateWidgetLayoutsData): Validated<SavedWidgetLayout[]> {
    return { ok: true as const, data: await this.repo.updateWidgetLayouts(data) };
  }
}
