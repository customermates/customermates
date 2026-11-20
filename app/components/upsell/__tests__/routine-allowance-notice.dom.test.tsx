import type { Root } from "react-dom/client";

import { act, Suspense } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { makeAutoObservable } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Stores = {
  automationsStore: RoutinesStoreDouble;
  userStore: { user: { id: string } };
};

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("../plan-upsell-notice", () => ({
  PlanUpsellNotice: ({ title }: { title: string }) => <div data-routine-notice="">{title}</div>,
}));

import { RoutineAllowanceNotice } from "../routine-allowance-notice";

class RoutinesStoreDouble {
  items: Array<{ kind: "routine" | "rule"; ownerUserId: string }> = [];
  isReady = false;

  constructor() {
    makeAutoObservable(this);
  }

  setItems(ownerUserIds: readonly string[]) {
    this.items = [
      { kind: "rule", ownerUserId: "user-1" },
      ...ownerUserIds.map((ownerUserId) => ({ kind: "routine" as const, ownerUserId })),
    ];
    this.isReady = true;
  }
}

function freshStores(): Stores {
  const stores = { automationsStore: new RoutinesStoreDouble(), userStore: { user: { id: "user-1" } } };
  harness.rootStore = stores;
  return stores;
}

function RoutinesView({ owners }: { owners: readonly string[] }) {
  const { automationsStore } = harness.rootStore as Stores;
  if (!automationsStore.isReady) automationsStore.setItems(owners);
  return <ul data-routines="" />;
}

function RoutinesPage({ owners }: { owners: readonly string[] }) {
  return (
    <Suspense fallback={null}>
      <RoutineAllowanceNotice initialOwnerUserIds={owners} plan="starter" />

      <RoutinesView owners={owners} />
    </Suspense>
  );
}

let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container.remove();
});

function serverThenHydrate(owners: readonly string[]) {
  freshStores();
  const html = renderToString(<RoutinesPage owners={owners} />);
  container.innerHTML = html;
  const stores = freshStores();
  const recoverable: unknown[] = [];
  act(() => {
    root = hydrateRoot(container, <RoutinesPage owners={owners} />, {
      onRecoverableError: (error) => recoverable.push(error),
    });
  });
  return { html, recoverable, stores };
}

describe("routine allowance notice on a server-rendered Routines page", () => {
  it("renders the notice on the server and hydrates it although the list fills the store while rendering", () => {
    const { html, recoverable } = serverThenHydrate(["user-1"]);

    expect(html).toContain("data-routine-notice");
    expect(recoverable).toEqual([]);
    expect(container.querySelectorAll("[data-routine-notice]")).toHaveLength(1);
  });

  it("renders nothing below the allowance and follows the store once it holds the routines", () => {
    const { html, recoverable, stores } = serverThenHydrate(["someone-else"]);

    expect(html).not.toContain("data-routine-notice");
    expect(recoverable).toEqual([]);
    expect(container.querySelectorAll("[data-routine-notice]")).toHaveLength(0);

    act(() => stores.automationsStore.setItems(["someone-else", "user-1"]));
    expect(container.querySelectorAll("[data-routine-notice]")).toHaveLength(1);
  });
});
