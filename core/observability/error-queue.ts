import type { ErrorReport } from "./error-report";

export function createErrorQueue(publish: (report: ErrorReport) => Promise<void>, maxBytes = 1_000_000) {
  const pending = new Set<Promise<void>>();
  let bytes = 0;
  return {
    send(report: ErrorReport): Promise<void> {
      const size = new TextEncoder().encode(JSON.stringify(report)).byteLength;
      if (pending.size >= 30 || bytes + size > maxBytes)
        return Promise.reject(new Error("Error reporting buffer is full"));
      const send = Promise.resolve().then(() => publish(report));
      bytes += size;
      pending.add(send);
      const done = () => {
        pending.delete(send);
        bytes -= size;
      };
      void send.then(done, done);
      return send;
    },
    async flush(timeout = 2000): Promise<boolean> {
      if (!pending.size) return true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          Promise.allSettled([...pending]).then((results) => results.every((result) => result.status === "fulfilled")),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), timeout);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
