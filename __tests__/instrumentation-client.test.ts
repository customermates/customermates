import { afterEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  init: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

type Listener = (event: unknown) => void;

function stubBrowser(pathname: string) {
  const listeners = new Map<string, Listener>();
  const idle: Array<() => void> = [];

  vi.stubGlobal("window", {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    location: { href: `https://customermates.test${pathname}`, pathname },
    removeEventListener: (type: string) => listeners.delete(type),
    requestIdleCallback: (callback: () => void) => idle.push(callback),
  });

  return { idle, listeners };
}

async function importInstrumentation() {
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");

  return import("../instrumentation-client");
}

afterEach(() => {
  sentry.captureException.mockClear();
  sentry.captureRouterTransitionStart.mockClear();
  sentry.init.mockClear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("client Sentry loading", () => {
  it("loads the SDK when an app route goes idle", async () => {
    const browser = stubBrowser("/en/dashboard");
    await importInstrumentation();

    expect(browser.idle).toHaveLength(1);
    browser.idle[0]();

    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledOnce());
  });

  it("schedules no SDK load on a marketing page until there is something to report", async () => {
    const browser = stubBrowser("/en/pricing");
    await importInstrumentation();

    expect(browser.idle).toHaveLength(0);
    expect(sentry.init).not.toHaveBeenCalled();

    const error = new Error("marketing failure");
    browser.listeners.get("error")?.({ error });

    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledExactlyOnceWith(error));
    expect(sentry.init).toHaveBeenCalledOnce();
  });

  it("keeps marketing navigations from loading the SDK, and loads it when a navigation leaves the marketing tree", async () => {
    stubBrowser("/en");
    const { onRouterTransitionStart } = await importInstrumentation();

    onRouterTransitionStart?.("/en/features/unified-inbox", "push");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sentry.init).not.toHaveBeenCalled();

    onRouterTransitionStart?.("/en/dashboard", "push");

    await vi.waitFor(() =>
      expect(sentry.captureRouterTransitionStart).toHaveBeenCalledExactlyOnceWith("/en/dashboard", "push"),
    );
    expect(sentry.init).toHaveBeenCalledOnce();
  });

  it("forwards marketing navigations once the SDK is running", async () => {
    const browser = stubBrowser("/en/dashboard");
    const { onRouterTransitionStart } = await importInstrumentation();
    browser.idle[0]();

    onRouterTransitionStart?.("/en/pricing", "push");

    await vi.waitFor(() =>
      expect(sentry.captureRouterTransitionStart).toHaveBeenCalledExactlyOnceWith("/en/pricing", "push"),
    );
  });
});
