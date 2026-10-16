import type { AddressInfo } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";

import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import { createClient, createConfig } from "@unipile/sdk/dist/client";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { fetchWithTimeout, requestedTimeoutMs } from "../messaging.service";

const HEADER = "x-customermates-timeout-ms";
const DEFAULT_MS = 30_000;

setFlagsFromString("--expose-gc");
const collectGarbage = runInNewContext("gc") as () => void;

type ReceivedRequest = {
  path: string;
  contentLength: string | null;
  contentType: string | null;
  transferEncoding: string | null;
  budgetHeader: string | null;
  body: string;
};

const received: ReceivedRequest[] = [];
const openResponses = new Set<ServerResponse>();

function answer(request: IncomingMessage, response: ServerResponse) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk: string) => (body += chunk));
  request.on("end", () => {
    const path = request.url ?? "";
    received.push({
      path,
      contentLength: request.headers["content-length"] ?? null,
      contentType: request.headers["content-type"] ?? null,
      transferEncoding: request.headers["transfer-encoding"] ?? null,
      budgetHeader: (request.headers[HEADER] as string | undefined) ?? null,
      body,
    });
    if (path.endsWith("/hang")) return void openResponses.add(response);
    response.writeHead(200, { "content-type": "application/json" });
    if (path.endsWith("/stall")) {
      openResponses.add(response);
      return void response.write('{"object":');
    }
    response.end('{"object":"EmailSent"}');
  });
}

const provider = createServer(answer);
let baseUrl = "";
let nextFetch: typeof fetch;
let inRequestScope: <T>(run: () => Promise<T>) => Promise<T>;

beforeAll(async () => {
  Object.assign(globalThis, { AsyncLocalStorage });
  const { createPatchedFetcher } = await import("next/dist/server/lib/patch-fetch");
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  const { workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external");
  nextFetch = createPatchedFetcher(globalThis.fetch, { workAsyncStorage, workUnitAsyncStorage });
  const workStore = {
    route: "/api/v1/mcp",
    isDraftMode: false,
    nextFetchId: 1,
    fetchCache: undefined,
    forceDynamic: true,
    shouldTrackFetchMetrics: false,
  };
  inRequestScope = (run) => workAsyncStorage.run(workStore as never, run);
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const response of openResponses) response.destroy();
  openResponses.clear();
  received.length = 0;
});

afterAll(async () => {
  Reflect.deleteProperty(globalThis, Symbol.for("next-patch"));
  provider.closeAllConnections();
  await new Promise<void>((resolve) => provider.close(() => resolve()));
});

function unipileClient() {
  return createClient(createConfig({ baseUrl, fetch: fetchWithTimeout }));
}

async function outcomeWithin<T>(work: Promise<T>, ms: number): Promise<T | "still pending"> {
  let timer: NodeJS.Timeout | undefined;
  const pending = new Promise<"still pending">((resolve) => {
    timer = setTimeout(() => resolve("still pending"), ms);
  });
  try {
    return await Promise.race([work, pending]);
  } finally {
    clearTimeout(timer);
  }
}

describe("unipile request timeout budget", () => {
  it("falls back to the default when no budget is declared", () => {
    expect(requestedTimeoutMs(new Request("https://example.test/"))).toBe(DEFAULT_MS);
  });

  it("honours a longer budget instead of overwriting it with the default", () => {
    const request = new Request("https://example.test/", { headers: { [HEADER]: "90000" } });

    expect(requestedTimeoutMs(request)).toBe(90_000);
  });

  it("strips the internal header so it never reaches unipile", () => {
    const request = new Request("https://example.test/", { headers: { [HEADER]: "90000" } });
    requestedTimeoutMs(request);

    expect(request.headers.get(HEADER)).toBeNull();
  });

  it("ignores a malformed budget rather than disabling the timeout", () => {
    for (const value of ["", "abc", "0", "-1"]) {
      const request = new Request("https://example.test/", { headers: { [HEADER]: value } });
      expect(requestedTimeoutMs(request)).toBe(DEFAULT_MS);
    }
  });

  it("defaults for a plain url, which is how the sdk calls a non-Request input", () => {
    expect(requestedTimeoutMs("https://example.test/")).toBe(DEFAULT_MS);
  });
});

describe("unipile request timeout behind the Next.js patched fetch", () => {
  it.each([
    { stage: "before the answer", path: "/v2/acc/emails/hang" },
    { stage: "while the answer body streams", path: "/v2/acc/emails/stall" },
  ])("aborts a stalled send $stage although garbage collection runs meanwhile", async ({ path }) => {
    vi.stubGlobal("fetch", nextFetch);
    const sweep = setInterval(collectGarbage, 20);
    const started = Date.now();
    try {
      const outcome = await inRequestScope(() =>
        outcomeWithin(
          unipileClient()
            .request({ method: "POST", url: path, body: { to: [] }, headers: { [HEADER]: "300" } })
            .then(
              (result) => result.error ?? "answered",
              (error: unknown) => error,
            ),
          3000,
        ),
      );

      expect(outcome).not.toBe("still pending");
      expect((outcome as Error).name).toBe("TimeoutError");
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      clearInterval(sweep);
    }
  });

  it("sends a json body with its length and without the internal budget header", async () => {
    vi.stubGlobal("fetch", nextFetch);
    const body = { subject: "Quarterly update", to: [{ identifier: "contact@example.test" }] };

    const result = await inRequestScope(() =>
      unipileClient().request({ method: "POST", url: "/v2/acc/emails/send", body, headers: { [HEADER]: "5000" } }),
    );

    expect(result.response?.status).toBe(200);
    expect(received).toEqual([
      {
        path: "/v2/acc/emails/send",
        contentLength: String(Buffer.byteLength(JSON.stringify(body))),
        contentType: "application/json",
        transferEncoding: null,
        budgetHeader: null,
        body: JSON.stringify(body),
      },
    ]);
  });

  it("keeps a multipart body and its boundary intact", async () => {
    vi.stubGlobal("fetch", nextFetch);
    const form = new FormData();
    form.append("subject", "With attachment");
    form.append("attachments[0]", new Blob(["file bytes"], { type: "text/plain" }), "proof.txt");

    const response = await inRequestScope(() =>
      fetchWithTimeout(
        new Request(`${baseUrl}/v2/acc/emails/send`, { method: "POST", body: form, headers: { [HEADER]: "5000" } }),
      ),
    );

    expect(response.status).toBe(200);
    const [request] = received;
    const [, boundary] = (request.contentType ?? "").split("boundary=");
    expect(boundary).toBeTruthy();
    expect(request.body).toContain(`--${boundary}`);
    expect(request.body).toContain('filename="proof.txt"');
    expect(request.body).toContain("file bytes");
    expect(request.contentLength).toBe(String(Buffer.byteLength(request.body)));
    expect(request.budgetHeader).toBeNull();
  });

  it("lets a caller's own signal decide instead of the default budget", async () => {
    const controller = new AbortController();
    const pending = fetchWithTimeout(`${baseUrl}/v2/acc/emails/hang`, { method: "POST", signal: controller.signal });
    controller.abort(new Error("caller cancelled"));

    await expect(pending).rejects.toThrow("caller cancelled");
  });
});
