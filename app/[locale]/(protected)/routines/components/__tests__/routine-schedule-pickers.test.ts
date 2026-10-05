import type { ComponentType } from "react";
import type { RoutineModalStore } from "../routine-modal.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RoutineTriggerKind } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  selects: [] as { id: string; label?: string | null; ariaLabel?: string }[],
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatTime: () => "09:00" }),
}));
vi.mock("@/components/data-view/use-column-label", () => ({
  useChangeFieldLabel: () => (field: string) => field,
}));
vi.mock("@/components/forms/form-select", () => ({
  FormSelect: (props: { id: string; label?: string | null; ariaLabel?: string }) => {
    harness.selects.push({ id: props.id, label: props.label, ariaLabel: props.ariaLabel });
    return null;
  },
}));
vi.mock("@/components/forms/form-input", () => ({ FormInput: () => null }));
vi.mock("@/components/forms/form-textarea", () => ({ FormTextarea: () => null }));
vi.mock("@/components/forms/form-switch", () => ({ FormSwitch: () => null }));
vi.mock("@/components/forms/form-autocomplete", () => ({ FormAutocomplete: () => null }));
vi.mock("@/components/data-view/filter-modal/filter-accordion", () => ({ FilterAccordion: () => null }));

import { RoutineConfigurationPane } from "../routine-configuration-pane";

function scheduleSelects(schedulePreset: string) {
  harness.selects = [];
  const store = {
    canManage: true,
    changeFields: [],
    compiledCron: null,
    customColumns: [],
    filterableFields: [],
    form: { enabled: true, schedulePreset, triggerKind: RoutineTriggerKind.schedule },
    hasAvailableOwner: true,
    isReadOnly: false,
  } as unknown as RoutineModalStore;

  renderToStaticMarkup(createElement(RoutineConfigurationPane, { store, onPause: vi.fn() }));

  return Object.fromEntries(
    harness.selects.filter((select) => select.label === null).map((select) => [select.id, select.ariaLabel]),
  );
}

describe("routine schedule pickers", () => {
  it("names the weekday, hour and minute pickers that sit in the sentence without a visible label", () => {
    expect(scheduleSelects("weekly")).toEqual({
      scheduleWeekday: "Common.inputs.scheduleWeekday",
      scheduleHour: "Common.inputs.scheduleHour",
      scheduleMinute: "Common.inputs.scheduleMinute",
    });
  });

  it("names the day-of-month picker of a monthly schedule", () => {
    expect(scheduleSelects("monthly")).toEqual({
      scheduleDayOfMonth: "Common.inputs.scheduleDayOfMonth",
      scheduleHour: "Common.inputs.scheduleHour",
      scheduleMinute: "Common.inputs.scheduleMinute",
    });
  });

  it("names the minute picker of an hourly schedule", () => {
    expect(scheduleSelects("hourly")).toEqual({
      scheduleMinute: "Common.inputs.scheduleMinute",
    });
  });
});
