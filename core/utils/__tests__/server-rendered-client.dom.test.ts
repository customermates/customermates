import type { Root } from "react-dom/client";

import { act, createElement, memo, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { serverRenderedClient } from "../server-rendered-client";

let mounts = 0;

function Counter() {
  const [mountId] = useState(() => ++mounts);
  return createElement("span", { "data-mount": mountId });
}

function flightReference<P extends object>(component: ComponentType<P>) {
  return {
    $$typeof: Symbol.for("react.lazy"),
    _payload: { status: "fulfilled", value: component, reason: null },
    _init: (payload: { value: ComponentType<P> }) => payload.value,
  } as unknown as ComponentType<P>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mounts = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderTwiceFromFreshReferences(component: ComponentType<object>) {
  act(() => root.render(createElement(flightReference(component))));
  act(() => root.render(createElement(flightReference(component))));
  return container.querySelector("span")?.getAttribute("data-mount");
}

describe("serverRenderedClient", () => {
  it("documents that a memo root remounts when a server refresh sends a new client reference", () => {
    expect(renderTwiceFromFreshReferences(memo(Counter))).toBe("2");
  });

  it("keeps the client root mounted across refreshed client references", () => {
    expect(renderTwiceFromFreshReferences(serverRenderedClient(memo(Counter)))).toBe("1");
  });
});
