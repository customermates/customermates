import type { AnyTask, TaskIdentifier, TaskPayload, TriggerOptions } from "@trigger.dev/sdk/v3";

import { tasks } from "@trigger.dev/sdk/v3";

import { transactionStorage } from "@/core/decorators/transaction-context";

export class BackgroundTaskService {
  async dispatch<TTask extends AnyTask>(
    id: TaskIdentifier<TTask>,
    payload: TaskPayload<TTask>,
    options?: TriggerOptions,
  ): Promise<{ runId: string | undefined } | undefined> {
    const trigger = async () => {
      const handle = await tasks.trigger<TTask>(id, payload, options);
      return handle?.id;
    };

    const store = transactionStorage.getStore();
    if (store) {
      store.afterCommit.push(async () => {
        await trigger();
      });
      return undefined;
    }

    const runId = await trigger();
    return { runId };
  }
}
