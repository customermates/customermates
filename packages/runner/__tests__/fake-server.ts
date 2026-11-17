import type { IncomingHttpHeaders } from "node:http";

import { createServer } from "node:http";

export type RecordedRequest = { method: string; path: string; headers: IncomingHttpHeaders; body: unknown };

export type FakeReply = { status: number; body?: unknown; headers?: Record<string, string> };

export type FakeServer = {
  url: string;
  requests: RecordedRequest[];
  on(path: string, reply: FakeReply | ((request: RecordedRequest) => FakeReply)): void;
  close(): Promise<void>;
};

export async function startFakeServer(): Promise<FakeServer> {
  const requests: RecordedRequest[] = [];
  const replies = new Map<string, FakeReply | ((request: RecordedRequest) => FakeReply)>();

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      const recorded: RecordedRequest = {
        method: req.method ?? "",
        path: req.url ?? "",
        headers: req.headers,
        body: text ? JSON.parse(text) : undefined,
      };
      requests.push(recorded);
      const configured = replies.get(recorded.path);
      const reply = typeof configured === "function" ? configured(recorded) : (configured ?? { status: 404 });
      res.writeHead(reply.status, { "content-type": "application/json", ...reply.headers });
      res.end(reply.body === undefined ? undefined : JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    on: (path, reply) => replies.set(path, reply),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
