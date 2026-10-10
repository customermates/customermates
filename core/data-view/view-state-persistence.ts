import type { RootStore } from "@/core/stores/root.store";

type Scope = { latest: symbol; submitted: boolean; discarded: boolean; pending?: Promise<void> };
const scopes = new WeakMap<RootStore, Map<string, Scope>>();

export interface ViewStateWriteIntent {
  isCurrent(): boolean;
  enqueue(job: () => Promise<void>): Promise<void>;
  discard(): void;
}

export function reserveViewStateWrite(root: RootStore, key: string): ViewStateWriteIntent {
  let entries = scopes.get(root);
  if (!entries) {
    entries = new Map();
    scopes.set(root, entries);
  }
  const token = Symbol();
  const scope = entries.get(key) ?? { latest: token, submitted: false, discarded: false };
  entries.set(key, scope);
  scope.latest = token;
  scope.submitted = false;
  scope.discarded = false;
  const isCurrent = () => entries.get(key) === scope && scope.latest === token && !scope.discarded;
  return {
    isCurrent,
    enqueue(job) {
      if (!isCurrent()) return Promise.resolve();
      scope.submitted = true;
      const run = () => (isCurrent() ? job() : Promise.resolve());
      const write = scope.pending ? scope.pending.catch(() => undefined).then(run) : run();
      scope.pending = write;
      const release = () => {
        if (scope.pending !== write) return;
        scope.pending = undefined;
        if (scope.submitted || scope.discarded) entries.delete(key);
      };
      void write.then(release, release);
      return write;
    },
    discard() {
      if (!isCurrent()) return;
      scope.discarded = true;
      if (!scope.pending) entries.delete(key);
    },
  };
}
