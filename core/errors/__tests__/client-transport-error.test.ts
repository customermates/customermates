import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({
  captureException,
}));

import { isClientTransportError } from "../client-transport-error";
import { registerApplicationErrorHandler, reportApplicationError, runClientAction } from "../report-application-error";

let unregister = () => {};

beforeEach(() => {
  captureException.mockClear();
});

afterEach(() => {
  unregister();
  unregister = () => {};
});

describe("isClientTransportError", () => {
  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "recognizes the browser transport TypeError %s",
    (message) => {
      expect(isClientTransportError(new TypeError(message))).toBe(true);
      expect(isClientTransportError({ name: "TypeError", message })).toBe(true);
    },
  );

  it("does not classify HTTP, application, or same-message non-TypeErrors as transport interruptions", () => {
    expect(isClientTransportError(new Error("Failed to fetch"))).toBe(false);
    expect(isClientTransportError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isClientTransportError({ name: "Error", message: "Load failed" })).toBe(false);
    expect(isClientTransportError("Failed to fetch")).toBe(false);
  });
});

describe("client action reporting", () => {
  it("shows a transport interruption to the application handler without sending it to Sentry", () => {
    const seen: unknown[] = [];
    unregister = registerApplicationErrorHandler((error) => seen.push(error));
    const error = new TypeError("Failed to fetch");

    reportApplicationError(error);

    expect(seen).toEqual([error]);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("continues to capture a genuine application error", () => {
    const seen: unknown[] = [];
    unregister = registerApplicationErrorHandler((error) => seen.push(error));
    const error = new TypeError("Cannot read properties of undefined");

    reportApplicationError(error);

    expect(seen).toEqual([error]);
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("contains both synchronous throws and asynchronous rejections", async () => {
    const seen: unknown[] = [];
    unregister = registerApplicationErrorHandler((error) => seen.push(error));
    const synchronous = new Error("sync");
    const asynchronous = new Error("async");

    runClientAction(() => {
      throw synchronous;
    });
    runClientAction(() => Promise.reject(asynchronous));

    await vi.waitFor(() => expect(seen).toEqual([synchronous, asynchronous]));
  });
});
