import type { Validated } from "@/core/validation/validation.utils";
import type { SpreadsheetReadFailureCode } from "@/features/data-transfer/spreadsheet/spreadsheet.schema";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { UploadWorkspaceSetupSpreadsheetData } from "./workspace-setup-input.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { readSpreadsheet } from "@/features/data-transfer/spreadsheet/read-spreadsheet";

import { UploadWorkspaceSetupSpreadsheetSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";

export type UploadedSetupSpreadsheet =
  | { accepted: true; fileName: string; sheetName: string; headers: string[]; rowCount: number }
  | { accepted: false; failure: SpreadsheetReadFailureCode };

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class UploadWorkspaceSetupSpreadsheetInteractor extends AuthenticatedInteractor<
  UploadWorkspaceSetupSpreadsheetData,
  UploadedSetupSpreadsheet
> {
  constructor(private repo: WorkspaceSetupRepo) {
    super();
  }

  @Write({ input: UploadWorkspaceSetupSpreadsheetSchema, tx: false })
  async invoke(data: UploadWorkspaceSetupSpreadsheetData): Validated<UploadedSetupSpreadsheet> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    if (!(await this.repo.get(data.setupId))) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    const read = await readSpreadsheet(data.bytes, { fileName: data.fileName });
    if (!read.ok) return { ok: true, data: { accepted: false, failure: read.code } };
    if (!(await this.repo.storeSpreadsheet(data.setupId, data.fileName, data.bytes)))
      return failConflict(CustomErrorCode.workspaceSetupConflict);
    return {
      ok: true,
      data: {
        accepted: true,
        fileName: data.fileName,
        sheetName: read.table.sheetName,
        headers: read.table.headers,
        rowCount: read.table.rows.length,
      },
    };
  }
}
