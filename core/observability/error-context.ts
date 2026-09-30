import { AsyncLocalStorage } from "node:async_hooks";

import type { CaptureContext } from "./capture-context";

const storage = new AsyncLocalStorage<CaptureContext>();
const thrownContexts = new WeakMap<object, CaptureContext>();

export function currentErrorContext(error?: unknown): CaptureContext {
  return (error && typeof error === "object" ? thrownContexts.get(error) : undefined) ?? storage.getStore() ?? {};
}

export async function runWithErrorContext<T>(context: CaptureContext, action: () => T | Promise<T>): Promise<T> {
  return storage.run(context, async () => {
    try {
      return await action();
    } catch (error) {
      if (error && typeof error === "object" && !thrownContexts.has(error))
        thrownContexts.set(error, { ...context, tags: { ...context.tags } });
      throw error;
    }
  });
}

export function withScope<T>(
  action: (scope: {
    setUser: (user: CaptureContext["user"]) => void;
    setTag: (key: string, value: string | number | boolean | undefined) => void;
    setContext: (key: string, value: Record<string, unknown> | null) => void;
    setLevel: (level: NonNullable<CaptureContext["level"]>) => void;
  }) => T,
): T {
  const parent = storage.getStore();
  const tags = { ...parent?.tags };
  const contexts = { ...parent?.contexts };
  const context: CaptureContext = { ...parent, tags, contexts };
  return storage.run(context, () =>
    action({
      setUser: (user) => (context.user = user),
      setTag: (key, value) => (tags[key] = value),
      setContext: (key, value) => (contexts[key] = value),
      setLevel: (level) => (context.level = level),
    }),
  );
}
