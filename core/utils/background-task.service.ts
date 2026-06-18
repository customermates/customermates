import { start } from "workflow/api";

import type { WorkflowId, WorkflowPayload } from "@/workflows/registry";

import { transactionStorage } from "@/core/decorators/transaction-context";
import { WORKFLOW_REGISTRY } from "@/workflows/registry";

export class BackgroundTaskService {
  async dispatch<TId extends WorkflowId>(id: TId, payload: WorkflowPayload<TId>): Promise<void> {
    const run = async () => {
      const workflow = WORKFLOW_REGISTRY[id] as (payload: unknown) => Promise<unknown>;
      await start(workflow, [payload]);
    };

    const store = transactionStorage.getStore();
    if (store) {
      store.afterCommit.push(run);
      return;
    }

    await run();
  }
}
