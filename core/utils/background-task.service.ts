import { resumeHook, start } from "workflow/api";
import { HookNotFoundError } from "workflow/errors";

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
    const run = async () => {
      await this.startWorkflow(id, payload);
    };

    const store = transactionStorage.getStore();
    if (store) {
      store.afterCommit.push(run);
      return;
    }

    await run();
  }

  async dispatchTracked<TId extends WorkflowId>(id: TId, payload: WorkflowPayload<TId>): Promise<string> {
    return this.startWorkflow(id, payload);
  }

  async resume(token: string, payload: Record<string, unknown>): Promise<boolean> {
    try {
      await resumeHook(token, payload);
      return true;
    } catch (error) {
      if (HookNotFoundError.is(error)) return false;
      throw error;
    }
  }

  private async startWorkflow<TId extends WorkflowId>(id: TId, payload: WorkflowPayload<TId>): Promise<string> {
    const tenant = currentTenant();
    const stamped = tenant ? { ...payload, tenant } : payload;
    const workflow = WORKFLOW_REGISTRY[id] as (payload: unknown) => Promise<unknown>;
    const run = await start(workflow, [stamped]);

    return run.runId;
  }
}
