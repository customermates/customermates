import { start } from "workflow/api";

import type { WorkflowId, WorkflowPayload } from "@/workflows/registry";
import type { WorkflowTenant } from "@/workflows/workflow-tenant";

import { tenantStorage } from "@/core/decorators/tenant-context";
import { transactionStorage } from "@/core/decorators/transaction-context";
import { WORKFLOW_REGISTRY } from "@/workflows/registry";

function currentTenant(): WorkflowTenant | undefined {
  const user = tenantStorage.getStore()?.user;

  return user ? { userId: user.id, companyId: user.companyId } : undefined;
}

export class BackgroundTaskService {
  async dispatch<TId extends WorkflowId>(id: TId, payload: WorkflowPayload<TId>): Promise<void> {
    const tenant = currentTenant();
    const stamped = tenant ? { ...payload, tenant } : payload;

    const run = async () => {
      const workflow = WORKFLOW_REGISTRY[id] as (payload: unknown) => Promise<unknown>;
      await start(workflow, [stamped]);
    };

    const store = transactionStorage.getStore();
    if (store) {
      store.afterCommit.push(run);
      return;
    }

    await run();
  }
}
