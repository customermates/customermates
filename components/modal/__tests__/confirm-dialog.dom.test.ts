import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));

import { ConfirmDialog } from "../confirm-dialog";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render(props: Partial<Parameters<typeof ConfirmDialog>[0]>) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(ConfirmDialog, {
        anchorScope: "confirm",
        description: "Are you sure?",
        open: true,
        title: "Delete",
        onCancel: vi.fn(),
        ...props,
      }),
    ),
  );
}

const nativeInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

function typeInto(input: HTMLInputElement | null, value: string) {
  act(() => {
    if (input) nativeInputValue?.set?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function confirmButton() {
  return document.getElementById("confirm") as HTMLButtonElement | null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

describe("ConfirmDialog", () => {
  it("shows only Close for a blocker without a confirm action", () => {
    const onCancel = vi.fn();
    render({ onCancel, children: createElement("p", { id: "blocker" }, "Used by a calculation") });
    expect(confirmButton()).toBeNull();
    expect(document.getElementById("blocker")).not.toBeNull();
    const close = document.getElementById("confirm-cancel");
    expect(close?.textContent).toBe("Common.actions.close");
    act(() => close?.click());
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("enables a typed-name confirmation only once the name matches", () => {
    const onConfirm = vi.fn();
    render({ onConfirm, confirmationText: "Deals", confirmLabel: "Delete permanently" });
    expect(confirmButton()?.disabled).toBe(true);
    const input = document.querySelector<HTMLInputElement>("[data-slot='confirm-dialog-confirmation']");
    typeInto(input, " Deals ");
    expect(confirmButton()?.disabled).toBe(false);
  });

  it("starts every opening with an empty typed-name confirmation", () => {
    const props = {
      anchorScope: "confirm",
      confirmationText: "Deals",
      description: "Are you sure?",
      title: "Delete",
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    };
    render({ ...props });
    const input = () => document.querySelector<HTMLInputElement>("[data-slot='confirm-dialog-confirmation']");
    typeInto(input(), "Deals");
    expect(confirmButton()?.disabled).toBe(false);
    act(() => root?.render(createElement(ConfirmDialog, { ...props, open: false })));
    act(() => root?.render(createElement(ConfirmDialog, { ...props, open: true })));
    expect(input()?.value).toBe("");
    expect(confirmButton()?.disabled).toBe(true);
  });

  it("keeps the dialog busy until an async confirmation settles", async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render({ onConfirm, confirmLabel: "Delete" });
    act(() => confirmButton()?.click());
    await vi.waitFor(() => expect(confirmButton()?.disabled).toBe(true));
    expect(confirmButton()?.getAttribute("aria-busy")).toBe("true");
    act(() => confirmButton()?.click());
    expect(onConfirm).toHaveBeenCalledOnce();
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(confirmButton()?.disabled).toBe(false);
  });
});
