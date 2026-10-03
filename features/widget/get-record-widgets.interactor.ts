import type { RecordActivityWidgetRepo } from "./record-activity-widget.schema";
import { compareRecordKey } from "@/features/records/record-json";
import type { RecordActivityWidgetReader } from "./record-activity-widget.interactor";
import { z } from "zod";

import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordWidgetRepo, GenericRecordWidgetDto } from "./record-widget.schema";
import type { RecordWidgetReader } from "./record-widget.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const RecordWidgetListSchema = z.object({}).strict();
export const RecordWidgetReadSchema = z.object({ id: z.uuid() }).strict();

@AllowInDemoMode
@TenantInteractor()
export class GetRecordWidgetInteractor extends AuthenticatedInteractor<
  z.infer<typeof RecordWidgetReadSchema>,
  GenericRecordWidgetDto
> {
  constructor(
    private widgets: RecordWidgetRepo,
    private reader: RecordWidgetReader,
    private policy: RecordAccessPolicy,
    private activityWidgets: RecordActivityWidgetRepo,
    private activityReader: RecordActivityWidgetReader,
  ) {
    super();
  }

  @Validate(RecordWidgetReadSchema)
  async invoke(input: z.infer<typeof RecordWidgetReadSchema>): Validated<GenericRecordWidgetDto> {
    return runInTransaction(
      async () => {
        if (!(await this.policy.load()).actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const row = await this.widgets.findReadable(input.id);
        if (row) return { ok: true as const, data: await this.reader.read(row) };
        const activity = await this.activityWidgets.findReadable(input.id);
        if (!activity) return failNotFound(CustomErrorCode.widgetNotFound);
        return { ok: true as const, data: await this.activityReader.read(activity) };
      },
      { readOnly: true, timeout: 30000 },
    );
  }
}

@AllowInDemoMode
@TenantInteractor()
export class GetRecordWidgetsInteractor extends AuthenticatedInteractor<
  z.infer<typeof RecordWidgetListSchema>,
  { widgets: GenericRecordWidgetDto[] }
> {
  constructor(
    private widgets: RecordWidgetRepo,
    private reader: RecordWidgetReader,
    private policy: RecordAccessPolicy,
    private activityWidgets: RecordActivityWidgetRepo,
    private activityReader: RecordActivityWidgetReader,
  ) {
    super();
  }

  @Validate(RecordWidgetListSchema)
  async invoke(_input: z.infer<typeof RecordWidgetListSchema> = {}): Validated<{ widgets: GenericRecordWidgetDto[] }> {
    return runInTransaction(
      async () => {
        if (!(await this.policy.load()).actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const widgets: GenericRecordWidgetDto[] = [];
        for (const row of await this.widgets.listOwned()) widgets.push(await this.reader.read(row));
        for (const row of await this.activityWidgets.listOwned()) widgets.push(await this.activityReader.read(row));
        widgets.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || compareRecordKey(a.id, b.id));
        return { ok: true as const, data: { widgets } };
      },
      { readOnly: true, timeout: 30000 },
    );
  }
}
