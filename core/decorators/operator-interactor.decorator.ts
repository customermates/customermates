import { runWithOperator } from "./operator-context";

type OperatorAuthorization = "authorizeFresh" | "authorizeRead";

function operatorInteractor<T extends { new (...args: any[]): object }>(
  constructor: T,
  authorization: OperatorAuthorization,
) {
  const originalInvoke = constructor.prototype.invoke;

  constructor.prototype.invoke = async function (...args: any[]) {
    const { getOperatorAccessService } = await import("@/core/di");
    const actor = await getOperatorAccessService()[authorization]();

    return runWithOperator(actor, () => originalInvoke.apply(this, args));
  };

  return constructor;
}

export function OperatorInteractor<T extends { new (...args: any[]): object }>(constructor: T) {
  return operatorInteractor(constructor, "authorizeFresh");
}

export function OperatorReadInteractor<T extends { new (...args: any[]): object }>(constructor: T) {
  return operatorInteractor(constructor, "authorizeRead");
}
