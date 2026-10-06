import { createContext, runInContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";

import {
  installNativeResponseCheckpoint,
  nativeResponseCheckpointState,
  type NativeResponseSnapshot,
  type NativeResponseTarget,
} from "../native-response-checkpoint";

const ORIGIN = "http://127.0.0.1:49159";
const ACTION = "synthetic-public-save-action";
const KEY = "__syntheticNativeResponseCheckpoint";
const target: NativeResponseTarget = {
  ids: [ACTION],
  origin: ORIGIN,
  surfaceKey: "records:11111111-1111-4111-8111-111111111111",
  viewKey: "__all__",
  searchTerm: "List recovery service",
};
type Control = {
  snapshot: () => NativeResponseSnapshot;
  restore: () => NativeResponseSnapshot;
};
const prototypes = [
  ReadableStream.prototype,
  ReadableStreamDefaultReader.prototype,
  ReadableStreamBYOBReader.prototype,
];
const names = [
  ["getReader", "cancel"],
  ["read", "cancel", "releaseLock"],
  ["read", "cancel", "releaseLock"],
];
const descriptors = prototypes.map((prototype, index) =>
  Object.fromEntries(names[index].map((name) => [name, Object.getOwnPropertyDescriptor(prototype, name)])),
);
const probes: Array<{ restore: () => NativeResponseSnapshot }> = [];

function input(changes: { url?: string; method?: string; action?: string; body?: BodyInit | null } = {}) {
  return [
    changes.url ?? "/en/records/type",
    {
      method: changes.method ?? "POST",
      headers: { "next-action": changes.action ?? ACTION },
      body:
        changes.body === undefined
          ? JSON.stringify([
              { surfaceKey: target.surfaceKey, viewKey: target.viewKey, state: { searchTerm: target.searchTerm } },
            ])
          : changes.body,
    },
  ] as const;
}

function installed(fetch: typeof globalThis.fetch) {
  const realm = createContext({
    fetch,
    Request,
    Response,
    Headers,
    URL,
    ReadableStream,
    ReadableStreamDefaultReader,
    ReadableStreamBYOBReader,
    location: { href: ORIGIN + "/en/records/type", origin: ORIGIN },
  });
  runInContext(`(${installNativeResponseCheckpoint.toString()})(${JSON.stringify({ ...target, key: KEY })});`, realm);
  const control = realm[KEY] as Control;
  let restored: NativeResponseSnapshot | undefined;
  const probe = {
    realm,
    fetch: realm.fetch as typeof globalThis.fetch,
    snapshot: () => control.snapshot(),
    restore: () => (restored ??= control.restore()),
  };
  probes.push(probe);
  return probe;
}

function response(bytes = Uint8Array.from([1, 2, 3, 4]), status = 200) {
  return new Response(
    new ReadableStream({
      start(controller) {
        if (bytes.byteLength > 0) controller.enqueue(bytes);
        controller.close();
      },
    }),
    { status },
  );
}

async function consume(value: Response) {
  const reader = value.body?.getReader();
  if (!reader) throw new Error("E_SYNTHETIC_RESPONSE_BODY");
  let result = await reader.read();
  while (!result.done) result = await reader.read();
  reader.releaseLock();
}

afterEach(() => {
  for (const probe of probes.splice(0).reverse()) probe.restore();
  prototypes.forEach((prototype, index) => {
    for (const name of names[index]) {
      const descriptor = descriptors[index][name];
      if (!descriptor) throw new Error("E_SYNTHETIC_READER_DESCRIPTOR");
      Object.defineProperty(prototype, name, descriptor);
    }
  });
});

describe("native response completion checkpoint", () => {
  it("observes the app's reads without draining and preserves native fetch/read promises, values, arguments and cleanup", async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          if (pulls === 1) controller.enqueue(Uint8Array.from([1, 2, 3, 4]));
          else controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const value = new Response(stream);
    const fetched = Promise.resolve(value);
    const receivers: unknown[] = [];
    let argumentsPassed: unknown[] = [];
    const originalRead: typeof ReadableStreamDefaultReader.prototype.read = Reflect.get(
      ReadableStreamDefaultReader.prototype,
      "read",
    );
    let readPromise: Promise<ReadableStreamReadResult<unknown>> | undefined;
    let readResult: ReadableStreamReadResult<unknown> | undefined;
    ReadableStreamDefaultReader.prototype.read = function (
      this: ReadableStreamDefaultReader<unknown>,
      ...args: Parameters<typeof originalRead>
    ) {
      readPromise = Reflect.apply(originalRead, this, args);
      void readPromise?.then((result) => {
        readResult = result;
      });
      return readPromise;
    } as typeof originalRead;
    const probe = installed(function (this: unknown, ...values: Parameters<typeof globalThis.fetch>) {
      receivers.push(this);
      argumentsPassed = values;
      return fetched;
    });
    const fetchReceiver = { synthetic: true };
    const args = input();
    const actual = Reflect.apply(probe.fetch, fetchReceiver, args);
    expect(actual).toBe(fetched);
    expect(receivers).toHaveLength(1);
    expect(receivers[0]).toBe(fetchReceiver);
    expect(argumentsPassed).toEqual(args);
    expect(await actual).toBe(value);
    expect(value.body).toBe(stream);
    expect(value.bodyUsed).toBe(false);
    expect(pulls).toBe(0);
    expect(probe.snapshot()).toMatchObject({ requests: 1, status: 200, bytes: 0, eof: 0 });
    const reader = stream.getReader();
    const first = reader.read();
    expect(first).toBe(readPromise);
    expect(await first).toBe(readResult);
    expect(pulls).toBe(1);
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("pending");
    expect((await reader.read()).done).toBe(true);
    reader.releaseLock();
    expect(probe.snapshot()).toEqual({
      requests: 1,
      status: 200,
      bytes: 4,
      chunks: 1,
      eof: 1,
      fetchErrors: 0,
      readErrors: 0,
      readerCancels: 0,
      streamCancels: 0,
      earlyReleases: 0,
      observationErrors: 0,
    });
    expect(nativeResponseCheckpointState(probe.restore())).toBe("complete");
    expect(probe.realm.fetch).not.toBe(probe.fetch);
    expect(probe.realm[KEY]).toBeUndefined();
    expect(Reflect.get(ReadableStreamDefaultReader.prototype, "read")).not.toBe(originalRead);
  });

  it("observes BYOB byte-stream reads and their natural EOF", async () => {
    const stream = new ReadableStream<Uint8Array>({
      type: "bytes",
      start(controller) {
        controller.enqueue(Uint8Array.from([5, 6, 7]));
        controller.close();
      },
    });
    const value = new Response(stream);
    const probe = installed(() => Promise.resolve(value));
    await probe.fetch(...input());
    const reader = stream.getReader({ mode: "byob" });
    const read = await reader.read(new Uint8Array(8));
    expect(read.done).toBe(false);
    if (read.done || !read.value) throw new Error("E_SYNTHETIC_BYOB_VALUE");
    expect([...read.value]).toEqual([5, 6, 7]);
    expect((await reader.read(new Uint8Array(8))).done).toBe(true);
    reader.releaseLock();
    expect(probe.snapshot()).toMatchObject({ bytes: 3, chunks: 1, eof: 1, earlyReleases: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("complete");
  });

  it.each([
    ["another action", { action: "unrelated-action" }],
    ["another origin", { url: "https://example.test/en/records/type" }],
    ["another method", { method: "GET" }],
    [
      "another search",
      {
        body: JSON.stringify([
          { surfaceKey: target.surfaceKey, viewKey: target.viewKey, state: { searchTerm: "stale" } },
        ]),
      },
    ],
    [
      "another surface",
      {
        body: JSON.stringify([
          { surfaceKey: "records:other", viewKey: target.viewKey, state: { searchTerm: target.searchTerm } },
        ]),
      },
    ],
    [
      "another view",
      {
        body: JSON.stringify([
          { surfaceKey: target.surfaceKey, viewKey: "custom", state: { searchTerm: target.searchTerm } },
        ]),
      },
    ],
    ["another arity", { body: JSON.stringify([{}, {}]) }],
    ["malformed arguments", { body: "{" }],
    ["unsupported body encoding", { body: new FormData() }],
  ] as const)("does not accept %s as the intended response", async (_label, changes) => {
    const value = response();
    const fetched = Promise.resolve(value);
    const probe = installed(() => fetched);
    expect(probe.fetch(...input(changes))).toBe(fetched);
    await consume(await fetched);
    expect(probe.snapshot()).toMatchObject({ requests: 0, status: 0, bytes: 0, eof: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("pending");
  });

  it("rejects a non-200 response even when its body reaches EOF", async () => {
    const probe = installed(() => Promise.resolve(response(undefined, 503)));
    await consume(await probe.fetch(...input()));
    expect(probe.snapshot()).toMatchObject({ requests: 1, status: 503, bytes: 4, eof: 1 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("failed");
  });

  it("requires a native body rather than treating headers as completion", async () => {
    const probe = installed(() => Promise.resolve(new Response(null, { status: 200 })));
    await probe.fetch(...input());
    expect(probe.snapshot()).toMatchObject({ requests: 1, status: 200, bytes: 0, eof: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("pending");
  });

  it("requires positive native bytes even when an empty stream ends", async () => {
    const probe = installed(() => Promise.resolve(response(new Uint8Array())));
    await consume(await probe.fetch(...input()));
    expect(probe.snapshot()).toMatchObject({ requests: 1, status: 200, bytes: 0, eof: 1 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("pending");
  });

  it("does not accept positive bytes before native EOF", async () => {
    const value = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([1]));
        },
      }),
    );
    const probe = installed(() => Promise.resolve(value));
    await probe.fetch(...input());
    const reader = value.body?.getReader();
    if (!reader) throw new Error("E_SYNTHETIC_RESPONSE_BODY");
    expect((await reader.read()).done).toBe(false);
    expect(probe.snapshot()).toMatchObject({ requests: 1, status: 200, bytes: 1, eof: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("pending");
  });

  it("rejects duplicate matching requests even when both bodies complete", async () => {
    const probe = installed(() => Promise.resolve(response()));
    await consume(await probe.fetch(...input()));
    await consume(await probe.fetch(...input()));
    expect(probe.snapshot()).toMatchObject({ requests: 2, status: 200, bytes: 8, eof: 2 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("failed");
  });

  it("preserves the original native fetch rejection and rejects its checkpoint", async () => {
    const error = new DOMException("SYNTHETIC_PRIVATE_SENTINEL", "AbortError");
    const fetched = Promise.reject(error);
    const probe = installed(() => fetched);
    const actual = probe.fetch(...input());
    expect(actual).toBe(fetched);
    await expect(actual).rejects.toBe(error);
    expect(probe.snapshot()).toMatchObject({ requests: 1, fetchErrors: 1, eof: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("failed");
    expect(JSON.stringify(probe.snapshot())).not.toContain("SYNTHETIC_PRIVATE_SENTINEL");
  });

  it("preserves synchronous native fetch failures", () => {
    const error = new Error("SYNTHETIC_PRIVATE_SENTINEL");
    const probe = installed(() => {
      throw error;
    });
    expect(() => probe.fetch(...input())).toThrow(error);
    expect(probe.snapshot()).toMatchObject({ requests: 1, fetchErrors: 1 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("failed");
  });

  it("preserves native read rejection identity and rejects incomplete streams", async () => {
    const error = new Error("SYNTHETIC_PRIVATE_SENTINEL");
    const value = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(error);
        },
      }),
    );
    const probe = installed(() => Promise.resolve(value));
    await probe.fetch(...input());
    const reader = value.body?.getReader();
    if (!reader) throw new Error("E_SYNTHETIC_RESPONSE_BODY");
    await expect(reader.read()).rejects.toBe(error);
    expect(probe.snapshot()).toMatchObject({ requests: 1, readErrors: 1, eof: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("failed");
    expect(JSON.stringify(probe.snapshot())).not.toContain("SYNTHETIC_PRIVATE_SENTINEL");
  });

  it("preserves synchronous native read failures", async () => {
    const error = new Error("SYNTHETIC_PRIVATE_SENTINEL");
    ReadableStreamDefaultReader.prototype.read = () => {
      throw error;
    };
    const value = response();
    const probe = installed(() => Promise.resolve(value));
    await probe.fetch(...input());
    const reader = value.body?.getReader();
    if (!reader) throw new Error("E_SYNTHETIC_RESPONSE_BODY");
    expect(() => reader.read()).toThrow(error);
    expect(probe.snapshot()).toMatchObject({ readErrors: 1, eof: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("failed");
  });

  it("records reader cancellation without duplicating or changing its native promise or reason", async () => {
    const reason = { private: "SYNTHETIC_PRIVATE_SENTINEL" };
    let cancellationReason: unknown;
    let cancels = 0;
    const value = new Response(
      new ReadableStream({
        cancel(value) {
          cancels += 1;
          cancellationReason = value;
        },
      }),
    );
    const cancel: typeof ReadableStreamDefaultReader.prototype.cancel = Reflect.get(
      ReadableStreamDefaultReader.prototype,
      "cancel",
    );
    let original: Promise<void> | undefined;
    ReadableStreamDefaultReader.prototype.cancel = function (...values: Parameters<typeof cancel>) {
      const result = Reflect.apply(cancel, this, values);
      original = result;
      return result;
    };
    const probe = installed(() => Promise.resolve(value));
    await probe.fetch(...input());
    const reader = value.body?.getReader();
    if (!reader) throw new Error("E_SYNTHETIC_RESPONSE_BODY");
    const actual = reader.cancel(reason);
    expect(actual).toBe(original);
    await actual;
    expect(cancels).toBe(1);
    expect(cancellationReason).toBe(reason);
    expect(probe.snapshot()).toMatchObject({ readerCancels: 1, eof: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("failed");
    expect(JSON.stringify(probe.snapshot())).not.toContain("SYNTHETIC_PRIVATE_SENTINEL");
  });

  it("records stream cancellation without duplicating or changing its native promise or reason", async () => {
    const reason = { private: "SYNTHETIC_PRIVATE_SENTINEL" };
    let cancellationReason: unknown;
    let cancels = 0;
    const value = new Response(
      new ReadableStream({
        cancel(value) {
          cancels += 1;
          cancellationReason = value;
        },
      }),
    );
    const cancel: typeof ReadableStream.prototype.cancel = Reflect.get(ReadableStream.prototype, "cancel");
    let original: Promise<void> | undefined;
    ReadableStream.prototype.cancel = function (...values: Parameters<typeof cancel>) {
      const result = Reflect.apply(cancel, this, values);
      original = result;
      return result;
    };
    const probe = installed(() => Promise.resolve(value));
    await probe.fetch(...input());
    const actual = value.body?.cancel(reason);
    expect(actual).toBe(original);
    await actual;
    expect(cancels).toBe(1);
    expect(cancellationReason).toBe(reason);
    expect(probe.snapshot()).toMatchObject({ streamCancels: 1, eof: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("failed");
  });

  it("rejects releasing the native reader before EOF", async () => {
    const value = response();
    const probe = installed(() => Promise.resolve(value));
    await probe.fetch(...input());
    value.body?.getReader().releaseLock();
    expect(probe.snapshot()).toMatchObject({ earlyReleases: 1, eof: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("failed");
  });

  it("preserves original values when observation fails and rejects missing observation", async () => {
    const error = new Error("SYNTHETIC_PRIVATE_SENTINEL");
    const result = Object.defineProperty({}, "done", {
      get() {
        throw error;
      },
    });
    const promise = Promise.resolve(result);
    ReadableStreamDefaultReader.prototype.read = () => promise as Promise<ReadableStreamReadResult<unknown>>;
    const value = response();
    const probe = installed(() => Promise.resolve(value));
    await probe.fetch(...input());
    const actual = value.body?.getReader().read();
    expect(actual).toBe(promise);
    expect(await actual).toBe(result);
    expect(probe.snapshot()).toMatchObject({ observationErrors: 1, eof: 0 });
    expect(nativeResponseCheckpointState(probe.snapshot())).toBe("failed");
  });

  it("does not overwrite an intervening wrapper and rejects lost observer ownership", async () => {
    const probe = installed(() => Promise.resolve(response()));
    await consume(await probe.fetch(...input()));
    const replacement = () => Promise.resolve(response());
    probe.realm.fetch = replacement;
    const final = probe.restore();
    expect(probe.realm.fetch).toBe(replacement);
    expect(final.observationErrors).toBe(1);
    expect(nativeResponseCheckpointState(final)).toBe("failed");
  });

  it("rejects a second installation without replacing the active observer", () => {
    const probe = installed(() => Promise.resolve(response()));
    const fetch = probe.realm.fetch;
    expect(() =>
      runInContext(
        `(${installNativeResponseCheckpoint.toString()})(${JSON.stringify({ ...target, key: KEY })});`,
        probe.realm,
      ),
    ).toThrow("E_NATIVE_RESPONSE_CHECKPOINT_INSTALLED");
    expect(probe.realm.fetch).toBe(fetch);
  });

  it("returns independent numeric snapshots without input, body, reason or error values", () => {
    const probe = installed(() => Promise.resolve(response()));
    const first = probe.snapshot();
    first.requests = 100;
    expect(probe.snapshot().requests).toBe(0);
    expect(Object.values(probe.snapshot()).every((value) => typeof value === "number")).toBe(true);
    expect(JSON.stringify(probe.snapshot())).not.toContain(target.surfaceKey);
    expect(JSON.stringify(probe.snapshot())).not.toContain(target.searchTerm);
  });

  it("rejects incomplete, unexpected and invalid counter snapshots", () => {
    const probe = installed(() => Promise.resolve(response()));
    const value = probe.snapshot();
    expect(nativeResponseCheckpointState({ ...value, bytes: -1 })).toBe("failed");
    expect(nativeResponseCheckpointState({ ...value, requests: 0.5 })).toBe("failed");
    expect(
      nativeResponseCheckpointState({ ...value, observationErrors: undefined } as unknown as NativeResponseSnapshot),
    ).toBe("failed");
    expect(
      nativeResponseCheckpointState({ ...value, body: "SYNTHETIC_PRIVATE_SENTINEL" } as NativeResponseSnapshot),
    ).toBe("failed");
  });
});
