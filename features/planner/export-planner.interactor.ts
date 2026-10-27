import type { z } from "zod";
import type { ReadPlannerInteractor } from "./read-planner.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import type { WorkspaceSlugResolver } from "@/features/workspace/workspace-slug-resolver";

import { env } from "@/env";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { plannerEntries, plannerIsTruncated } from "./planner-entries";
import { plannerICalendar } from "./planner-ical";

import { ExportPlannerSchema } from "./calendar-subscription.schema";
@AllowInDemoMode
@TenantInteractor()
export class ExportPlannerInteractor extends AuthenticatedInteractor<z.infer<typeof ExportPlannerSchema>, string> {
  constructor(
    private reader: ReadPlannerInteractor,
    private slugs: WorkspaceSlugResolver,
  ) {
    super();
  }
  @Validate(ExportPlannerSchema)
  async invoke({ includePersonalEvents, ...query }: z.infer<typeof ExportPlannerSchema>): Validated<string> {
    const result = await this.reader.invoke({
      ...query,
      config: { ...query.config, calendarIds: includePersonalEvents ? query.config.calendarIds : [] },
    });
    if (!result.ok) return result;
    if (plannerIsTruncated(result.data)) return fail(CustomErrorCode.calendarExportIncomplete, ["window"]);
    const slug = await this.slugs.requireSlugOf(this.user);
    const recordUrl = (typeId: string, recordId: string) =>
      absoluteWorkspaceUrl(env.BASE_URL, null, slug, `/records/${typeId}/${recordId}`);
    return {
      ok: true,
      data: plannerICalendar(plannerEntries(result.data, query.config.timeZone), recordUrl, new Date()),
    };
  }
}
