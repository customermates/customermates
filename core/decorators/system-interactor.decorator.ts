import { isAllowedInDemoMode } from "./allow-in-demo-mode.decorator";
import { runWithoutTenant } from "./tenant-context";

import { env } from "@/env";
import { DemoModeError } from "@/core/errors/app-errors";

export function SystemInteractor<T extends { new (...args: any[]): object }>(constructor: T) {
  const originalInvoke = constructor.prototype.invoke;

  constructor.prototype.invoke = function (...args: any[]) {
    if (env.DEMO_MODE && !isAllowedInDemoMode(constructor)) throw new DemoModeError();

    return runWithoutTenant(() => originalInvoke.apply(this, args));
  };

  return constructor;
}
