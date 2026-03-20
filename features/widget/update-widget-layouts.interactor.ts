import { z } from "zod";

import { Data } from "@/core/validation/validation.utils";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";

const LayoutBreakpointSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number().nullable().optional(),
  w: z.number(),
  h: z.number(),
  minW: z.number().optional(),
  maxW: z.number().optional(),
  minH: z.number().optional(),
  maxH: z.number().optional(),
});
export type WidgetLayoutBreakpoint = Data<typeof LayoutBreakpointSchema>;

const LayoutSchema = z.object({
  xs: z.array(LayoutBreakpointSchema),
  sm: z.array(LayoutBreakpointSchema),
  md: z.array(LayoutBreakpointSchema),
  lg: z.array(LayoutBreakpointSchema),
});
export type LayoutsData = Data<typeof LayoutSchema>;

const Schema = z.object({
  layouts: LayoutSchema,
});
export type UpdateWidgetLayoutsData = Data<typeof Schema>;

export abstract class UpdateWidgetLayoutsRepo {
  abstract updateWidgetLayouts(args: UpdateWidgetLayoutsData): Promise<void>;
}

@TentantInteractor()
export class UpdateWidgetLayoutsInteractor {
  constructor(private repo: UpdateWidgetLayoutsRepo) {}

  @Enforce(Schema)
  async invoke(data: UpdateWidgetLayoutsData): Promise<void> {
    await this.repo.updateWidgetLayouts(data);
  }
}
