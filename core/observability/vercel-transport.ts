import type { ErrorEvent, NodeOptions } from "@sentry/nextjs";

import { errorReport } from "./error-report";
import type { ErrorReport } from "./error-report";

type Transport = ReturnType<NonNullable<NodeOptions["transport"]>>;
type Publish = (report: ErrorReport) => Promise<void>;

export function createVercelErrorTransport(source: ErrorReport["source"], publish: Publish): Transport {
  const pending = new Set<Promise<unknown>>();

  return {
    send(envelope) {
      if (pending.size >= 30) return Promise.reject(new Error("Error reporting buffer is full"));
      const reports = envelope[1].flatMap(([header, payload]) => {
        if (header.type !== "event" || !payload || typeof payload !== "object") return [];
        const report = errorReport(payload as ErrorEvent, source);
        return report ? [report] : [];
      });
      const send = Promise.all(reports.map(publish)).then(() => ({ statusCode: 200 }));
      pending.add(send);
      void send.then(
        () => pending.delete(send),
        () => pending.delete(send),
      );
      return send;
    },
    async flush(timeout) {
      if (!pending.size) return true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const drained = Promise.allSettled([...pending]).then((results) =>
        results.every((result) => result.status === "fulfilled"),
      );
      try {
        return timeout === undefined
          ? await drained
          : await Promise.race([
              drained,
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

export async function publishBrowserError(report: ErrorReport): Promise<void> {
  const response = await fetch("/api/observability/errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
    credentials: "same-origin",
    keepalive: true,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Error report was not accepted");
}
