export function createLiveDocsRetrievalAdmission() {
  let pending = Promise.resolve();
  return {
    run<T>(invoke: () => Promise<T>): Promise<T> {
      const next = pending.then(invoke);
      pending = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    drain: () => pending,
  };
}
