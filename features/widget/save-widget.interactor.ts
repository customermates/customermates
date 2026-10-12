import type { UpsertRecordActivityWidgetInteractor } from "./record-activity-widget.interactor";
import type { RecordActivityWidgetInput } from "./record-activity-widget.schema";
import type { UpsertRecordWidgetInteractor } from "./record-widget.interactor";
import type { GenericRecordWidgetDto, RecordWidgetInput } from "./record-widget.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { FindOwnedWidgetKindRepo } from "./find-owned-widget-kind.repo";

import { z } from "zod";
import { WidgetKind } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const SaveWidgetSchema = z.looseObject({
  kind: z.enum(WidgetKind).optional(),
  id: z.uuid().optional(),
});
export type SaveWidgetInput = z.infer<typeof SaveWidgetSchema>;

@TenantInteractor()
export class SaveWidgetInteractor extends AuthenticatedInteractor<SaveWidgetInput, GenericRecordWidgetDto> {
  constructor(
    private widgets: FindOwnedWidgetKindRepo,
    private charts: UpsertRecordWidgetInteractor,
    private timelines: UpsertRecordActivityWidgetInteractor,
  ) {
    super();
  }

  @Validate(SaveWidgetSchema)
  async invoke(input: SaveWidgetInput): Validated<GenericRecordWidgetDto> {
    const stored = input.id ? await this.widgets.findOwnedWidgetKind(input.id) : null;
    if (input.id && !stored) return failNotFound(CustomErrorCode.widgetNotFound, ["id"]);
    if (stored && input.kind && input.kind !== stored) return fail(CustomErrorCode.widgetKindImmutable, ["kind"]);
    const kind = stored ?? input.kind ?? WidgetKind.chart;

    return kind === WidgetKind.activityTimeline
      ? this.timelines.invoke({ ...input, kind } as RecordActivityWidgetInput)
      : this.charts.invoke({ ...input, kind } as RecordWidgetInput);
  }
}
