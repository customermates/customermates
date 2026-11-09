import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  search: "",
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(harness.search) }));
vi.mock("sonner", () => ({ toast: { success: harness.success, error: harness.error } }));

import { ConnectedAccountsStatusToast } from "../connected-accounts-status-toast";
import {
  ONBOARDING_CONNECT_STORAGE_KEY,
  readOnboardingConnect,
  rememberOnboardingConnect,
} from "../onboarding-connect-return";

const CHANNELS_PATH = "/en/w/atlas/settings/channels";

let container: HTMLDivElement;
let root: Root;

async function returnFromProvider(search: string) {
  harness.search = search;
  window.history.replaceState(null, "", `${CHANNELS_PATH}?${search}`);
  await act(async () => {
    root.render(createElement(ConnectedAccountsStatusToast));
    await Promise.resolve();
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ConnectedAccountsStatusToast", () => {
  it("brings a connection started from onboarding back to the onboarding card in its connected state", async () => {
    rememberOnboardingConnect("linkedin");

    await returnFromProvider("account_id=acc_1&status=CREATION_SUCCESS");

    expect(harness.success).toHaveBeenCalledOnce();
    expect(window.location.pathname + window.location.search).toBe(
      `${CHANNELS_PATH}?from=onboarding&connected=linkedin`,
    );
    expect(window.sessionStorage.getItem(ONBOARDING_CONNECT_STORAGE_KEY)).toBeNull();
  });

  it("keeps the onboarding card after a failed connection so the user can try again", async () => {
    rememberOnboardingConnect("google");

    await returnFromProvider("error_type=errors/expired_link");

    expect(harness.error).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("?from=onboarding");
  });

  it("leaves a connection started on the plain Channels page as it was", async () => {
    await returnFromProvider("account_id=acc_1");

    expect(harness.success).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("");
  });

  it("ignores an onboarding marker older than the hosted connection link", async () => {
    rememberOnboardingConnect("linkedin", Date.now() - 31 * 60_000);

    expect(readOnboardingConnect()).toBeNull();
    await returnFromProvider("account_id=acc_1");
    expect(window.location.search).toBe("");
  });
});
