import type { UpdateWidgetLayoutsRepo } from "./update-widget-layouts.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { WidgetLayoutSchema } from "./widget.schema";
import {
  WIDGET_GRID_BREAKPOINT_COLUMNS,
  WIDGET_GRID_MARGIN,
  WIDGET_GRID_MAX_ROW,
  WIDGET_GRID_ROW_HEIGHT,
} from "./widget-grid";
import { resolveWidgetLayout } from "./widget-placement";

import { BREAKPOINTS } from "@/constants/breakpoints";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const WIDGET_LAYOUT_MAX_ITEMS = 500;

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
      y: z
        .number()
        .int()
        .min(0)
        .max(WIDGET_GRID_MAX_ROW)
        .describe(`Row from the top, in rows of ${WIDGET_GRID_ROW_HEIGHT} px with ${WIDGET_GRID_MARGIN} px gaps.`),
      w: z.number().int().min(1).max(columns).describe(`Width in columns, 1 to ${columns}.`),
      h: z
        .number()
        .int()
        .min(1)
        .max(WIDGET_GRID_MAX_ROW)
        .describe(`Height in rows of ${WIDGET_GRID_ROW_HEIGHT} px with ${WIDGET_GRID_MARGIN} px gaps.`),
    })
    .strict()
    .refine((value) => value.x + value.w <= columns, {
      path: ["w"],
      message: `The widget must fit the ${columns}-column grid: x + w can be at most ${columns}.`,
    });
  return z.array(item).max(WIDGET_LAYOUT_MAX_ITEMS);
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
    expectedVersions: z
      .record(z.uuid(), z.number().int().positive())
      .refine((versions) => Object.keys(versions).length <= WIDGET_LAYOUT_MAX_ITEMS, "Too many widgets")
      .describe("The version you last read for every widget named in layouts, keyed by widget id."),
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
