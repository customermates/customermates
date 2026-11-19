import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(harness.search) }));

import { useConnectIntent } from "../use-connect-intent";

const CLIENTS = ["claude", "openai"] as const;

type Dialog = { open: string | null };

function SettingsPage({ dialog, enabled = true }: { dialog: Dialog; enabled?: boolean }) {
  useConnectIntent(CLIENTS, enabled, (client) => {
    dialog.open = client;
  });
  return <main />;
}

function Shell({ dialog, path, enabled }: { dialog: Dialog; path: string; enabled?: boolean }) {
  const previous = useRef(path);
  useEffect(() => {
    if (previous.current !== path) dialog.open = null;
    previous.current = path;
  }, [dialog, path]);
  return path === "/settings/api-keys" ? <SettingsPage dialog={dialog} enabled={enabled} /> : <section />;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.search = "";
  window.history.replaceState(null, "", "/dashboard");
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(shell: ReactNode) {
  await act(async () => {
    root.render(shell);
    await Promise.resolve();
  });
}

async function navigate(dialog: Dialog, search: string, enabled = true) {
  await render(<Shell dialog={dialog} path="/dashboard" />);
  harness.search = search;
  window.history.replaceState(null, "", `/settings/api-keys?${search}`);
  await render(<Shell dialog={dialog} enabled={enabled} path="/settings/api-keys" />);
}

describe("starting a connection from a link that names it", () => {
  it("opens the connection after the shell has closed the dialogs of the page before", async () => {
    const dialog: Dialog = { open: "left over from the dashboard" };

    await navigate(dialog, "connect=claude");

    expect(dialog.open).toBe("claude");
    expect(window.location.search).toBe("");
  });

  it("keeps other parameters, ignores an unknown target and waits until connecting is allowed", async () => {
    const unknown: Dialog = { open: null };
    await navigate(unknown, "connect=fax&tab=keys");
    expect(unknown.open).toBeNull();
    expect(window.location.search).toBe("?tab=keys");

    const waiting: Dialog = { open: null };
    await navigate(waiting, "connect=openai", false);
    expect(waiting.open).toBeNull();
    expect(window.location.search).toBe("?connect=openai");
    await render(<Shell enabled dialog={waiting} path="/settings/api-keys" />);
    expect(waiting.open).toBe("openai");
  });
});
