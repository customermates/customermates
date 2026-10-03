import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { WidgetLayoutItemSchema, WidgetLayoutSchema } from "./widget.schema";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";

const LayoutSchema = z.object({
  xs: z.array(WidgetLayoutItemSchema),
  sm: z.array(WidgetLayoutItemSchema),
  md: z.array(WidgetLayoutItemSchema),
  lg: z.array(WidgetLayoutItemSchema),
});

const Schema = z.object({
  layouts: LayoutSchema,
});
export type UpdateWidgetLayoutsData = Data<typeof Schema>;

export const SavedWidgetLayoutSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  layout: WidgetLayoutSchema,
});
export type SavedWidgetLayout = Data<typeof SavedWidgetLayoutSchema>;

export abstract class UpdateWidgetLayoutsRepo {
  abstract updateWidgetLayouts(args: UpdateWidgetLayoutsData): Promise<SavedWidgetLayout[]>;
}

@TenantInteractor()
export class UpdateWidgetLayoutsInteractor extends AuthenticatedInteractor<
  UpdateWidgetLayoutsData,
  SavedWidgetLayout[]
> {
  constructor(private repo: UpdateWidgetLayoutsRepo) {
    super();
  }

  @Enforce(Schema)
  async invoke(data: UpdateWidgetLayoutsData): Promise<{ ok: true; data: SavedWidgetLayout[] }> {
    return { ok: true as const, data: await this.repo.updateWidgetLayouts(data) };
  }
}
