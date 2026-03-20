import { injectable } from "inversify";

import { isAllowedInDemoMode } from "./allow-in-demo-mode.decorator";
import { runWithoutTenant } from "./tenant-context";

import { IS_DEMO_MODE } from "@/constants/env";

export function SystemInteractor<T extends { new (...args: any[]): object }>(constructor: T) {
  injectable()(constructor);

  const originalInvoke = constructor.prototype.invoke;

  if (typeof constructor.prototype.invoke !== "function")
    throw new Error(`Class ${constructor.name} must implement an "invoke" method.`);

  constructor.prototype.invoke = function (...args: any[]) {
    if (IS_DEMO_MODE && !isAllowedInDemoMode(constructor))
      throw new Error("This action is not available in demo mode. Please sign in to access all features.");

    return runWithoutTenant(() => originalInvoke.apply(this, args));
  };

  return constructor;
}
