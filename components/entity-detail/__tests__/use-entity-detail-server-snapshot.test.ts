import type { Root } from "react-dom/client";
import type { EntityDetailInitial } from "../entity-detail-layout";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { action, makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEntityDetailServerSnapshot } from "../use-entity-detail-server-snapshot";

type TestEntity = {
  id: string;
  name: string;
  users: Array<{ id: string }>;
  customFieldValues: [];
};

function entity(id: string, name: string): TestEntity {
  return { id, name, users: [], customFieldValues: [] };
}

function initial(value: TestEntity): EntityDetailInitial {
  return { entity: value, customColumns: [] };
}

class TestStore {
  fetchedEntity: TestEntity | null;
  requestedEntityId: string | null;
  entityLoadState: "idle" | "loading" | "ready" | "not-found" | "error";
  hydrateCalls: Array<[TestEntity, unknown[]]> = [];
  loadCalls: string[] = [];

  constructor(value: TestEntity | null) {
    this.fetchedEntity = value;
    this.requestedEntityId = value?.id ?? null;
    this.entityLoadState = value ? "ready" : "idle";

    makeObservable(this, {
      fetchedEntity: observable.ref,
      requestedEntityId: observable,
      entityLoadState: observable,
      hydrateServerSnapshot: action,
      loadById: action,
    });
  }

  hydrateServerSnapshot(value: TestEntity, customColumns: unknown[]) {
    this.hydrateCalls.push([value, customColumns]);
    this.fetchedEntity = value;
    this.entityLoadState = "ready";
  }

  loadById(id: string) {
    this.loadCalls.push(id);
    this.fetchedEntity = null;
    this.requestedEntityId = id;
    this.entityLoadState = "loading";
    return Promise.resolve(false);
  }
}

const Probe = observer(
  ({
    store,
    entityId,
    entityInitial,
  }: {
    store: TestStore;
    entityId: string;
    entityInitial?: EntityDetailInitial | null;
  }) => {
    const applied = useEntityDetailServerSnapshot(store as never, entityId, entityInitial);
    return createElement(
      "div",
      { "data-applied": String(applied), "data-state": store.entityLoadState },
      store.fetchedEntity?.name,
    );
  },
);

const roots = new Set<Root>();

function mount(store: TestStore, entityInitial?: EntityDetailInitial | null) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  act(() => root.render(createElement(Probe, { entityId: "contact-1", entityInitial, store })));
  return { container, root };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("useEntityDetailServerSnapshot", () => {
  it("replaces a same-id cache with the authoritative server entity after commit", () => {
    const store = new TestStore(entity("contact-1", "Cached"));
    const serverEntity = entity("contact-1", "Server");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { container } = mount(store, initial(serverEntity));

    expect(store.hydrateCalls).toEqual([[serverEntity, []]]);
    expect(store.loadCalls).toEqual([]);
    expect(container.textContent).toBe("Server");
    expect(container.firstElementChild?.getAttribute("data-applied")).toBe("true");
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("while rendering");
    consoleError.mockRestore();
  });

  it("clears and revalidates a same-id cache when the server snapshot is null", () => {
    const store = new TestStore(entity("contact-1", "Cached"));
    const { container } = mount(store, null);

    expect(store.loadCalls).toEqual(["contact-1"]);
    expect(store.fetchedEntity).toBeNull();
    expect(container.textContent).toBe("");
    expect(container.firstElementChild?.getAttribute("data-state")).toBe("loading");
  });

  it("applies a newer server snapshot for the same entity id", () => {
    const store = new TestStore(null);
    const first = initial(entity("contact-1", "First"));
    const second = initial(entity("contact-1", "Second"));
    const { container, root } = mount(store, first);

    act(() => root.render(createElement(Probe, { entityId: "contact-1", entityInitial: second, store })));

    expect(store.hydrateCalls).toHaveLength(2);
    expect(store.hydrateCalls[1]?.[0]).toBe(second.entity);
    expect(container.textContent).toBe("Second");
  });

  it("keeps a same-id cache when no server snapshot was supplied", () => {
    const store = new TestStore(entity("contact-1", "Cached"));
    const { container } = mount(store);

    expect(store.hydrateCalls).toEqual([]);
    expect(store.loadCalls).toEqual([]);
    expect(container.textContent).toBe("Cached");
  });
});
