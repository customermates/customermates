import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  save: vi.fn(),
  pause: vi.fn(),
  success: vi.fn(),
}));

const translate = vi.hoisted(
  () => (key: string, values?: Record<string, string>) => (values ? `${key}:${Object.values(values).join(",")}` : key),
);

vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("sonner", () => ({ toast: { success: harness.success, error: vi.fn() } }));
vi.mock("../notification-preferences-actions", () => ({
  setNotificationPreferencesAction: harness.save,
  setNotificationPauseAction: harness.pause,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatDescriptiveLongDate: (date: Date) => date.toISOString().slice(0, 10) }),
}));
vi.mock(import("@/core/utils/time-zone"), async (importOriginal) => ({
  ...(await importOriginal()),
  browserTimeZone: () => "America/New_York",
}));
vi.mock("@/components/forms/form-iso-date-picker", () => ({
  FormIsoDatePicker: ({
    min,
    value,
    onValueChange,
  }: {
    min?: string;
    value?: string;
    onValueChange?: (value: string) => void;
  }) =>
    createElement(
      "button",
      { type: "button", "data-testid": "pause-until", "data-min": min, onClick: () => onValueChange?.("2999-02-01") },
      value ?? "",
    ),
}));

import { NotificationPreferencesCard } from "../notification-preferences-card";

const MODES = { dueToday: "digest", replyReceived: "digest", ruleAlert: "instant" } as const;

let container: HTMLDivElement;
let root: Root;

function result(modes: Record<string, string>, pausedUntil: string | null = null) {
  return {
    ok: true,
    data: { preferences: Object.entries(modes).map(([kind, emailMode]) => ({ kind, emailMode })), pausedUntil },
  };
}

async function render(pausedUntil: string | null = null) {
  await act(async () => {
    root.render(createElement(NotificationPreferencesCard, { initial: result(MODES, pausedUntil).data as never }));
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

async function clickPause() {
  await act(async () => {
    pauseSwitch().click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
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
    harness.save.mockResolvedValue(result({ ...MODES, dueToday: "off" }));
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

  it("pauses all emails on the server for a week and keeps the kinds as they are", async () => {
    harness.pause.mockImplementation(({ until }: { until: string }) => Promise.resolve(result(MODES, until)));
    await render();

    await clickPause();

    expect(harness.pause).toHaveBeenCalledTimes(1);
    const { until, timeZone } = harness.pause.mock.calls[0][0] as { until: string; timeZone: string };
    expect(until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(timeZone).toBe("America/New_York");
    expect(harness.save).not.toHaveBeenCalled();
    expect(pauseSwitch().getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[data-testid="pause-until"]')?.textContent).toBe(until);
    expect(choiceOf("ruleAlert", "Notifications.emailMode.instant").dataset.state).toBe("active");
    expect(choiceOf("ruleAlert", "Notifications.emailMode.instant").disabled).toBe(true);
    expect(harness.success).toHaveBeenCalledWith(`Notifications.preferences.pauseOn:${until}`);
  });

  it("shows a pause the server already holds and ends it from the switch", async () => {
    harness.pause.mockResolvedValue(result(MODES, null));
    await render("2999-01-01");
    expect(pauseSwitch().getAttribute("aria-checked")).toBe("true");

    await clickPause();

    expect(harness.pause).toHaveBeenCalledWith({ until: null, timeZone: "America/New_York" });
    expect(pauseSwitch().getAttribute("aria-checked")).toBe("false");
    expect(harness.success).toHaveBeenCalledWith("Notifications.preferences.pauseOff");
    expect(choiceOf("ruleAlert", "Notifications.emailMode.instant").disabled).toBe(false);
  });

  it("moves the end of a pause through the date picker", async () => {
    harness.pause.mockResolvedValue(result(MODES, "2999-02-01"));
    await render("2999-01-01");

    const picker = container.querySelector<HTMLButtonElement>('[data-testid="pause-until"]');
    if (!picker) throw new Error("No date picker");
    expect(picker.textContent).toBe("2999-01-01");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(picker.dataset.min).toBe(
      `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`,
    );
    await act(async () => {
      picker.click();
      await Promise.resolve();
    });

    expect(harness.pause).toHaveBeenCalledWith({ until: "2999-02-01", timeZone: "America/New_York" });
    expect(container.querySelector('[data-testid="pause-until"]')?.textContent).toBe("2999-02-01");
  });

  it("keeps the pause as it was when the server refuses the new end", async () => {
    harness.pause.mockResolvedValue({ ok: false, error: {} });
    await render("2999-01-01");

    await clickPause();

    expect(pauseSwitch().getAttribute("aria-checked")).toBe("true");
    expect(harness.success).not.toHaveBeenCalled();
  });
});
