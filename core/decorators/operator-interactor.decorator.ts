import type { OperatorActor } from "./operator-context";

import { runWithOperator } from "./operator-context";

export function OperatorInteractor<T extends { new (...args: any[]): object }>(constructor: T) {
  const originalInvoke = constructor.prototype.invoke;

  constructor.prototype.invoke = async function (...args: any[]) {
    const { getOperatorAccessService } = (await import("@/core/di")) as unknown as {
      getOperatorAccessService: () => { authorizeFresh: () => Promise<OperatorActor> };
    };
    const actor = await getOperatorAccessService().authorizeFresh();

    return runWithOperator(actor, () => originalInvoke.apply(this, args));
  };

  return constructor;
}
