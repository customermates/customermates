import { AsyncLocalStorage } from "node:async_hooks";

export type OperatorActor = Readonly<{
  authUserId: string;
  userId: string;
  companyId: string;
  email: string;
}>;

export const operatorStorage = new AsyncLocalStorage<OperatorActor>();

export function runWithOperator<T>(actor: OperatorActor, fn: () => T | Promise<T>): Promise<T> {
  return operatorStorage.run(actor, () => Promise.resolve(fn()));
}

export function getOperatorActor(): OperatorActor {
  const actor = operatorStorage.getStore();
  if (!actor) throw new Error("Operator context missing");

  return actor;
}
