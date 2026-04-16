import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

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
export class UpdateWidgetLayoutsInteractor extends BaseInteractor<UpdateWidgetLayoutsData, null> {
  constructor(private repo: UpdateWidgetLayoutsRepo) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(z.null())
  async invoke(data: UpdateWidgetLayoutsData): Promise<{ ok: true; data: null }> {
    await this.repo.updateWidgetLayouts(data);
    return { ok: true as const, data: null };
  }
}
