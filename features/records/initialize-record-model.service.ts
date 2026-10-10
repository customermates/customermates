import { getTranslations } from "next-intl/server";
import type { RecordRepo } from "./record.repo";
import { UserAccessor } from "@/core/base/user-accessor";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { createWorkspaceRecordPreset } from "./workspace-record-preset";
import { validateRecordModel } from "./record-model-validation";

export class InitializeRecordModelService extends UserAccessor {
  constructor(private records: RecordRepo) {
    super();
  }

  initialize(): Promise<void> {
    return runInTransaction(async () => {
      if ((await this.records.getState())?.revision) return;
      const translate = await getTranslations();
      const model = createWorkspaceRecordPreset(this.companyId, translate);
      if (validateRecordModel(model).issues.length) throw new Error("The workspace record preset is invalid.");
      await this.records.saveModel(model, this.userId, {
        version: 1,
        source: { kind: "initialization" },
        causeId: "workspace-record-preset",
        expectedRevision: 0,
        references: [],
        grants: [],
      });
    });
  }
}
