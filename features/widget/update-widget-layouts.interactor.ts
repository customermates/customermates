import type { UpdateWidgetLayoutsRepo } from "./update-widget-layouts.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import {
  WIDGET_BREAKPOINT_COLUMNS,
  WIDGET_LAYOUT_MAX_ITEMS,
  WidgetLayoutSchema,
  widgetLayoutUpdateItemSchema,
} from "./widget-display.schema";
import { resolveWidgetLayout } from "./widget-placement";

import { BREAKPOINTS } from "@/constants/breakpoints";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const LayoutSchema = z
  .object({
    xs: z.array(widgetLayoutUpdateItemSchema(WIDGET_BREAKPOINT_COLUMNS.xs)).max(WIDGET_LAYOUT_MAX_ITEMS),
    sm: z.array(widgetLayoutUpdateItemSchema(WIDGET_BREAKPOINT_COLUMNS.sm)).max(WIDGET_LAYOUT_MAX_ITEMS),
    md: z.array(widgetLayoutUpdateItemSchema(WIDGET_BREAKPOINT_COLUMNS.md)).max(WIDGET_LAYOUT_MAX_ITEMS),
    lg: z.array(widgetLayoutUpdateItemSchema(WIDGET_BREAKPOINT_COLUMNS.lg)).max(WIDGET_LAYOUT_MAX_ITEMS),
  })
  .strict();

const Schema = z
  .object({
    layouts: LayoutSchema,
    expectedVersions: z
      .record(z.uuid(), z.number().int().positive())
      .refine((versions) => Object.keys(versions).length <= WIDGET_LAYOUT_MAX_ITEMS, "Too many widgets"),
  })
  .strict()
  .superRefine((data, ctx) => {
    for (const breakpoint of BREAKPOINTS) {
      const seen = new Set<string>();
      data.layouts[breakpoint].forEach((item, index) => {
        if (seen.has(item.i)) {
          ctx.addIssue({
            code: "custom",
            path: ["layouts", breakpoint, index, "i"],
            message: "A widget appears twice",
          });
        }
        seen.add(item.i);
        if (data.expectedVersions[item.i] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["expectedVersions", item.i],
            message: "The widget version is required",
          });
        }
      });
    }
  });
export type UpdateWidgetLayoutsData = Data<typeof Schema>;

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

  @Validate(Schema)
  async invoke(data: UpdateWidgetLayoutsData): Validated<SavedWidgetLayout[]> {
    return runInTransaction(async (): Validated<SavedWidgetLayout[]> => {
      const ids = [...new Set(BREAKPOINTS.flatMap((breakpoint) => data.layouts[breakpoint].map((item) => item.i)))];
      const targets = await this.repo.findLayoutTargets(ids);
      if (
        targets.length !== ids.length ||
        targets.some((target) => data.expectedVersions[target.id] !== target.version)
      )
        return failConflict(CustomErrorCode.widgetLayoutChanged);
      const large = new Map(data.layouts.lg.map((item) => [item.i, item]));
      for (const viewId of new Set(targets.map((target) => target.viewId))) {
        const widgets = (await this.repo.listLayoutPlacements(viewId)).map((widget) => {
          const requested = large.get(widget.id);
          return requested ? { ...widget, layout: { ...(widget.layout ?? {}), lg: requested } } : widget;
        });
        for (const target of targets.filter((candidate) => candidate.viewId === viewId)) {
          const requested = large.get(target.id);
          if (!requested) continue;
          const resolved = resolveWidgetLayout({
            id: target.id,
            kind: target.kind,
            requested: { x: requested.x, y: requested.y, w: requested.w, h: requested.h },
            needsPlacement: false,
            widgets,
          });
          if (!resolved.ok) return fail(resolved.code, ["layouts", "lg"]);
        }
      }
      const saved = await this.repo.saveWidgetLayouts(
        targets.map((target) => ({
          id: target.id,
          expectedVersion: target.version,
          current: target.layout,
          layout: Object.fromEntries(
            BREAKPOINTS.map((breakpoint) => [
              breakpoint,
              data.layouts[breakpoint].find((item) => item.i === target.id),
            ]),
          ),
        })),
      );
      if (!saved) return failConflict(CustomErrorCode.widgetLayoutChanged);
      return { ok: true as const, data: saved };
    });
  }
}
