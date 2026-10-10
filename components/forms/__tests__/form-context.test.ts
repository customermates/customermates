import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";
import type { BaseFormStore } from "@/core/base/base-form.store";

import { act, createElement } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("@/components/modal/use-navigation-guard", () => ({
  useNavigationGuard: vi.fn(),
}));

import { AppForm } from "../form-context";
import { registerApplicationErrorHandler } from "@/core/errors/report-application-error";

type TestAppFormProps = Omit<ComponentProps<typeof AppForm>, "children"> & {
  children?: ReactNode;
};
const TestAppForm = AppForm as ComponentType<TestAppFormProps>;

let root: ReactRoot | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  captureException.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("AppForm submission boundary", () => {
  it("submits a portaled child form without submitting its parent", () => {
    const parentSubmit = vi.fn();
    const childSubmit = vi.fn();
    const parent = { onSubmit: parentSubmit } as unknown as BaseFormStore;
    const child = { onSubmit: childSubmit } as unknown as BaseFormStore;
    container = document.createElement("div");
    document.body.append(container);
    const portal = document.createElement("div");
    container.append(portal);
    const mount = document.createElement("div");
    container.append(mount);
    root = createRoot(mount);
    act(() => {
      root?.render(
        createElement(
          TestAppForm,
          { store: parent },
          createPortal(createElement(TestAppForm, { store: child }, "Child"), portal),
        ),
      );
    });
    const form = portal.querySelector("form");
    expect(form).not.toBeNull();
    act(() => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(childSubmit).toHaveBeenCalledTimes(1);
    expect(parentSubmit).not.toHaveBeenCalled();
  });

  it("reports a rejected store submission instead of dropping its promise", async () => {
    const error = new TypeError("Failed to fetch");
    const onSubmit = vi.fn().mockRejectedValue(error);
    const seen: unknown[] = [];
    const unregister = registerApplicationErrorHandler((reported) => seen.push(reported));
    const store = { onSubmit } as unknown as BaseFormStore;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(createElement(TestAppForm, { store }, createElement("button", { type: "submit" }, "Save")));
    });

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    act(() => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    await vi.waitFor(() => expect(seen).toEqual([error]));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
    unregister();
  });
});
