import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  save: vi.fn(),
  success: vi.fn(),
}));

const translate = vi.hoisted(
  () => (key: string, values?: Record<string, string>) => (values ? `${key}:${Object.values(values).join(",")}` : key),
);

vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("sonner", () => ({ toast: { success: harness.success, error: vi.fn() } }));
vi.mock("../notification-preferences-actions", () => ({ setNotificationPreferencesAction: harness.save }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatDescriptiveLongDate: (date: Date) => date.toISOString().slice(0, 10) }),
}));
vi.mock("@/components/forms/form-iso-date-picker", () => ({
  FormIsoDatePicker: ({ value, onValueChange }: { value?: string; onValueChange?: (value: string) => void }) =>
    createElement("input", {
      "data-testid": "pause-until",
      value: value ?? "",
      onChange: (event: { target: { value: string } }) => onValueChange?.(event.target.value),
    }),
}));

import { NOTIFICATION_PAUSE_STORAGE_KEY } from "../notification-pause";
import { NotificationPreferencesCard } from "../notification-preferences-card";

const INITIAL = {
  preferences: [
    { kind: "dueToday", emailMode: "digest" },
    { kind: "replyReceived", emailMode: "digest" },
    { kind: "ruleAlert", emailMode: "instant" },
  ],
} as const;

let container: HTMLDivElement;
let root: Root;

function result(modes: Record<string, string>) {
  return {
    ok: true,
    data: { preferences: Object.entries(modes).map(([kind, emailMode]) => ({ kind, emailMode })) },
  };
}

async function render() {
  await act(async () => {
    root.render(createElement(NotificationPreferencesCard, { initial: INITIAL as never }));
    await Promise.resolve();
  });
}

function rowOf(kind: string) {
  const row = container.querySelector<HTMLElement>(`[data-notification-kind="${kind}"]`);
  if (!row) throw new Error(`No row for ${kind}`);
  return row;
}

function choiceOf(kind: string, label: string) {
  const choice = [...rowOf(kind).querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (tab) => tab.textContent === label,
  );
  if (!choice) throw new Error(`No ${label} choice for ${kind}`);
  return choice;
}

async function choose(kind: string, label: string) {
  const choice = choiceOf(kind, label);
  await act(async () => {
    choice.focus();
    choice.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await Promise.resolve();
  });
}

function pauseSwitch() {
  const toggle = container.querySelector<HTMLButtonElement>("#notification-pause");
  if (!toggle) throw new Error("No pause switch");
  return toggle;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("NotificationPreferencesCard", () => {
  it("shows one row per kind with three choices and the mode each kind has", async () => {
    await render();

    const rows = [...container.querySelectorAll<HTMLElement>("[data-notification-kind]")];
    expect(rows.map((row) => row.dataset.notificationKind)).toEqual(["dueToday", "replyReceived", "ruleAlert"]);
    for (const row of rows) {
      expect([...row.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual([
        "Notifications.emailMode.instant",
        "Notifications.emailMode.digest",
        "Notifications.emailMode.off",
      ]);
    }
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-notification-kind="ruleAlert"] [role="tab"]')].map(
        (tab) => tab.dataset.state,
      ),
    ).toEqual(["active", "inactive", "inactive"]);
    expect(container.textContent).toContain("Notifications.preferences.kind");
  });

  it("saves the one kind that changed and keeps the answer", async () => {
    harness.save.mockResolvedValue(result({ dueToday: "off", replyReceived: "digest", ruleAlert: "instant" }));
    await render();

    await choose("dueToday", "Notifications.emailMode.off");

    expect(harness.save).toHaveBeenCalledWith({ preferences: [{ kind: "dueToday", emailMode: "off" }] });
    expect(choiceOf("dueToday", "Notifications.emailMode.off").dataset.state).toBe("active");
  });

  it("puts a choice back when saving fails", async () => {
    harness.save.mockResolvedValue({ ok: false, error: {} });
    await render();

    await choose("dueToday", "Notifications.emailMode.off");

    expect(choiceOf("dueToday", "Notifications.emailMode.digest").dataset.state).toBe("active");
  });

  it("pauses all emails by switching the three kinds off and remembering what they were", async () => {
    harness.save.mockResolvedValue(result({ dueToday: "off", replyReceived: "off", ruleAlert: "off" }));
    await render();

    await act(async () => {
      pauseSwitch().click();
      await Promise.resolve();
    });

    expect(harness.save).toHaveBeenCalledWith({
      preferences: [
        { kind: "dueToday", emailMode: "off" },
        { kind: "replyReceived", emailMode: "off" },
        { kind: "ruleAlert", emailMode: "off" },
      ],
    });
    const stored = JSON.parse(window.localStorage.getItem(NOTIFICATION_PAUSE_STORAGE_KEY) ?? "{}");
    expect(stored.previous).toEqual({ dueToday: "digest", replyReceived: "digest", ruleAlert: "instant" });
    expect(stored.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pauseSwitch().getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[data-testid="pause-until"]')).not.toBeNull();
    expect(harness.success).toHaveBeenCalled();
  });

  it("brings the earlier choices back when the pause is switched off", async () => {
    window.localStorage.setItem(
      NOTIFICATION_PAUSE_STORAGE_KEY,
      JSON.stringify({
        until: "2999-01-01",
        previous: { dueToday: "instant", replyReceived: "digest", ruleAlert: "off" },
      }),
    );
    harness.save.mockResolvedValue(result({ dueToday: "instant", replyReceived: "digest", ruleAlert: "off" }));
    await render();
    expect(pauseSwitch().getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      pauseSwitch().click();
      await Promise.resolve();
    });

    expect(harness.save).toHaveBeenCalledWith({
      preferences: [
        { kind: "dueToday", emailMode: "instant" },
        { kind: "replyReceived", emailMode: "digest" },
        { kind: "ruleAlert", emailMode: "off" },
      ],
    });
    expect(window.localStorage.getItem(NOTIFICATION_PAUSE_STORAGE_KEY)).toBeNull();
    expect(pauseSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("brings the choices back on its own when the page opens on or after the end day", async () => {
    window.localStorage.setItem(
      NOTIFICATION_PAUSE_STORAGE_KEY,
      JSON.stringify({
        until: "2020-01-01",
        previous: { dueToday: "digest", replyReceived: "digest", ruleAlert: "instant" },
      }),
    );
    harness.save.mockResolvedValue(result({ dueToday: "digest", replyReceived: "digest", ruleAlert: "instant" }));

    await render();

    expect(harness.save).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(NOTIFICATION_PAUSE_STORAGE_KEY)).toBeNull();
    expect(pauseSwitch().getAttribute("aria-checked")).toBe("false");
  });
});
