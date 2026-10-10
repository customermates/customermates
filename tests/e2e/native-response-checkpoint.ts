import type { Page } from "@playwright/test";

export type NativeResponseTarget = {
  ids: string[];
  origin: string;
  surfaceKey: string;
  viewKey: string;
  searchTerm: string;
};

export type NativeResponseSnapshot = {
  requests: number;
  status: number;
  bytes: number;
  chunks: number;
  eof: number;
  fetchErrors: number;
  readErrors: number;
  readerCancels: number;
  streamCancels: number;
  earlyReleases: number;
  observationErrors: number;
};

type NativeResponseControl = {
  snapshot: () => NativeResponseSnapshot;
  restore: () => NativeResponseSnapshot;
};

const KEY = "__crmNativeResponseCheckpoint";

export function nativeResponseCheckpointState(snapshot: NativeResponseSnapshot): "pending" | "complete" | "failed" {
  const keys: Array<keyof NativeResponseSnapshot> = [
    "requests",
    "status",
    "bytes",
    "chunks",
    "eof",
    "fetchErrors",
    "readErrors",
    "readerCancels",
    "streamCancels",
    "earlyReleases",
    "observationErrors",
  ];
  if (
    Object.keys(snapshot).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(snapshot, key) || !Number.isSafeInteger(snapshot[key]) || snapshot[key] < 0) ||
    snapshot.requests > 1 ||
    (snapshot.status !== 0 && snapshot.status !== 200) ||
    snapshot.fetchErrors +
      snapshot.readErrors +
      snapshot.readerCancels +
      snapshot.streamCancels +
      snapshot.earlyReleases +
      snapshot.observationErrors >
      0
  )
    return "failed";
  return snapshot.requests === 1 &&
    snapshot.status === 200 &&
    snapshot.bytes > 0 &&
    snapshot.chunks > 0 &&
    snapshot.eof > 0
    ? "complete"
    : "pending";
}

export function installNativeResponseCheckpoint(options: NativeResponseTarget & { key: string }) {
  const globals = globalThis as unknown as Record<string, unknown>;
  if (Object.hasOwn(globals, options.key)) throw new Error("E_NATIVE_RESPONSE_CHECKPOINT_INSTALLED");
  const metrics: NativeResponseSnapshot = {
    requests: 0,
    status: 0,
    bytes: 0,
    chunks: 0,
    eof: 0,
    fetchErrors: 0,
    readErrors: 0,
    readerCancels: 0,
    streamCancels: 0,
    earlyReleases: 0,
    observationErrors: 0,
  };
  const streams = new WeakSet<ReadableStream>();
  const readers = new WeakSet<object>();
  const ids = new Set(options.ids);
  const nativeThen: typeof Promise.prototype.then = Reflect.get(Promise.prototype, "then");
  const undo: Array<() => void> = [];
  const patch = <T extends object, K extends keyof T>(host: T, key: K, replacement: T[K]) => {
    const original = host[key];
    host[key] = replacement;
    undo.push(() => {
      if (host[key] === replacement) host[key] = original;
      else metrics.observationErrors += 1;
    });
  };
  const observe = <T>(promise: Promise<T>, success: (value: T) => void, failure: () => void): Promise<T> => {
    try {
      Reflect.apply(nativeThen, promise, [
        (value: T) => {
          try {
            success(value);
          } catch {
            metrics.observationErrors += 1;
          }
        },
        () => {
          try {
            failure();
          } catch {
            metrics.observationErrors += 1;
          }
        },
      ]);
    } catch {
      metrics.observationErrors += 1;
    }
    return promise;
  };
  const matches = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.href
              : null;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (
        raw === null ||
        location.origin !== options.origin ||
        new URL(raw, location.href).origin !== options.origin ||
        method.toUpperCase() !== "POST" ||
        !ids.has(headers.get("next-action") ?? "") ||
        typeof init?.body !== "string"
      )
        return false;
      const args: unknown = JSON.parse(init.body);
      if (!Array.isArray(args) || args.length !== 1) return false;
      const value: unknown = args[0];
      return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        "surfaceKey" in value &&
        value.surfaceKey === options.surfaceKey &&
        "viewKey" in value &&
        value.viewKey === options.viewKey &&
        "state" in value &&
        typeof value.state === "object" &&
        value.state !== null &&
        !Array.isArray(value.state) &&
        "searchTerm" in value.state &&
        value.state.searchTerm === options.searchTerm
      );
    } catch {
      return false;
    }
  };
  const nativeFetch = globalThis.fetch;
  patch(globalThis, "fetch", function (this: unknown, ...args: Parameters<typeof nativeFetch>): Promise<Response> {
    const [input, init] = args;
    if (!matches(input, init)) return Reflect.apply(nativeFetch, this, args);
    metrics.requests += 1;
    let fetched: Promise<Response>;
    try {
      fetched = Reflect.apply(nativeFetch, this, args);
    } catch (error) {
      metrics.fetchErrors += 1;
      throw error;
    }
    return observe(
      fetched,
      (response) => {
        metrics.status = response.status;
        if (response.body) streams.add(response.body);
      },
      () => {
        metrics.fetchErrors += 1;
      },
    );
  });
  const getReader: typeof ReadableStream.prototype.getReader = Reflect.get(ReadableStream.prototype, "getReader");
  patch(ReadableStream.prototype, "getReader", function (this: ReadableStream, ...args: unknown[]) {
    let reader;
    try {
      reader = Reflect.apply(getReader, this, args);
    } catch (error) {
      if (streams.has(this)) metrics.readErrors += 1;
      throw error;
    }
    if (streams.has(this)) readers.add(reader);
    return reader;
  } as typeof getReader);
  const streamCancel: typeof ReadableStream.prototype.cancel = Reflect.get(ReadableStream.prototype, "cancel");
  patch(ReadableStream.prototype, "cancel", function (this: ReadableStream, ...args: unknown[]) {
    if (streams.has(this)) metrics.streamCancels += 1;
    return Reflect.apply(streamCancel, this, args);
  });
  for (const Reader of [globalThis.ReadableStreamDefaultReader, globalThis.ReadableStreamBYOBReader]) {
    if (!Reader) continue;
    const read: typeof Reader.prototype.read = Reflect.get(Reader.prototype, "read");
    patch(Reader.prototype, "read", function (this: object, ...args: unknown[]) {
      const tracked = readers.has(this);
      let result: Promise<ReadableStreamReadResult<unknown>>;
      try {
        result = Reflect.apply(read, this, args);
      } catch (error) {
        if (tracked) metrics.readErrors += 1;
        throw error;
      }
      if (!tracked) return result;
      return observe(
        result,
        (value) => {
          if (value.done) metrics.eof += 1;
          else {
            metrics.chunks += 1;
            if (ArrayBuffer.isView(value.value)) metrics.bytes += value.value.byteLength;
          }
        },
        () => {
          metrics.readErrors += 1;
        },
      );
    } as typeof read);
    const cancel: typeof Reader.prototype.cancel = Reflect.get(Reader.prototype, "cancel");
    patch(Reader.prototype, "cancel", function (this: object, ...args: unknown[]) {
      if (readers.has(this)) metrics.readerCancels += 1;
      return Reflect.apply(cancel, this, args);
    });
    const release: typeof Reader.prototype.releaseLock = Reflect.get(Reader.prototype, "releaseLock");
    patch(Reader.prototype, "releaseLock", function (this: object, ...args: unknown[]) {
      if (readers.has(this) && metrics.eof === 0) metrics.earlyReleases += 1;
      return Reflect.apply(release, this, args);
    });
  }
  const control: NativeResponseControl = {
    snapshot: () => ({ ...metrics }),
    restore: () => {
      for (const restore of undo.reverse()) restore();
      if (!Reflect.deleteProperty(globals, options.key)) metrics.observationErrors += 1;
      return { ...metrics };
    },
  };
  Object.defineProperty(globals, options.key, { configurable: true, value: control });
}

export async function observeNativeResponse(page: Page, target: NativeResponseTarget) {
  await page.evaluate(installNativeResponseCheckpoint, { ...target, key: KEY });
  return {
    snapshot: () =>
      page.evaluate((key) => {
        const control = (globalThis as unknown as Record<string, NativeResponseControl>)[key];
        if (!control) throw new Error("E_NATIVE_RESPONSE_CHECKPOINT_MISSING");
        return control.snapshot();
      }, KEY),
    stop: () =>
      page.evaluate((key) => {
        const control = (globalThis as unknown as Record<string, NativeResponseControl>)[key];
        if (!control) throw new Error("E_NATIVE_RESPONSE_CHECKPOINT_MISSING");
        return control.restore();
      }, KEY),
  };
}
