import { isAllowedInDemoMode } from "./allow-in-demo-mode.decorator";
import { runWithoutTenant } from "./tenant-context";

import { IS_DEMO_MODE } from "@/constants/env";
import { DemoModeError } from "@/core/errors/app-errors";

export function SystemInteractor<T extends { new (...args: any[]): object }>(constructor: T) {
  const originalInvoke = constructor.prototype.invoke;

  constructor.prototype.invoke = function (...args: any[]) {
    if (IS_DEMO_MODE && !isAllowedInDemoMode(constructor)) throw new DemoModeError();

    return runWithoutTenant(() => originalInvoke.apply(this, args));
  };

  return constructor;
}
