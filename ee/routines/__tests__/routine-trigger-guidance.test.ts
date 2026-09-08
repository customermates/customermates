import { readFileSync } from "node:fs";
import { join } from "node:path";

import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";

import {
  ROUTINE_TRIGGER_GUIDANCE,
  ROUTINE_TRIGGER_GUIDANCE_ACTIONS,
  orderedRoutineTriggerGuidance,
  routineTriggerGuidance,
} from "@/ee/routines/routine-trigger-guidance";
import { ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine-trigger-events";
import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";

const CONDITION_KEYS = [
  "filters",
  "filtersWithDeletion",
  "ownerAccess",
  "paused",
  "suppression",
  "unsaved",
  "watchedFields",
] as const;
const SCHEDULE_KEYS = ["activateFirst", "description", "ownerOnly", "saveFirst", "testNow"] as const;

function localeMessages(locale: AppLocale): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function messageAt(messages: Record<string, unknown>, path: string): string {
  let value: unknown = messages;
  for (const segment of path.split("."))
    value = value && typeof value === "object" ? (value as Record<string, unknown>)[segment] : undefined;

  expect(value, `missing translation ${path}`).toEqual(expect.any(String));
  expect((value as string).trim(), `blank translation ${path}`).not.toBe("");

  return value as string;
}

describe("routine trigger empty-state guidance", () => {
  it("covers exactly every selectable event", () => {
    expect(ROUTINE_TRIGGER_EVENTS).toHaveLength(24);
    expect(Object.keys(ROUTINE_TRIGGER_GUIDANCE)).toEqual([...ROUTINE_TRIGGER_EVENTS]);

    for (const event of ROUTINE_TRIGGER_EVENTS) expect(routineTriggerGuidance(event)).not.toBeNull();
    expect(routineTriggerGuidance("messaging.email.deleted")).toBeNull();
    expect(routineTriggerGuidance("messaging.chat.deleted")).toBeNull();
  });

  it("keeps selected guidance in catalog order and removes duplicates or unsupported events", () => {
    const first = ROUTINE_TRIGGER_EVENTS[0];
    const last = ROUTINE_TRIGGER_EVENTS.at(-1);

    expect(last).toBeDefined();
    if (!last) return;

    expect(orderedRoutineTriggerGuidance([last, "unsupported.event", first, last]).map(({ event }) => event)).toEqual([
      first,
      last,
    ]);
  });

  it("distinguishes record deletion from message deletion for filter guidance", () => {
    expect(routineTriggerGuidance("contact.deleted")?.action).toBe("recordDeleted");
    expect(routineTriggerGuidance("messaging.message.deleted")?.action).toBe("messageDeleted");
  });

  it.each(APP_LOCALES)("has renderable event and schedule guidance in %s", (locale) => {
    const messages = localeMessages(locale);

    messageAt(messages, "RoutineDetail.empty.title");
    messageAt(messages, "RoutineDetail.empty.event.description");
    messageAt(messages, "RoutineDetail.empty.event.instructionsLabel");

    for (const event of ROUTINE_TRIGGER_EVENTS) messageAt(messages, `Common.events.${event}`);
    for (const action of ROUTINE_TRIGGER_GUIDANCE_ACTIONS) {
      const template = messageAt(messages, `RoutineDetail.empty.event.actions.${action}`);
      const rendered = new IntlMessageFormat(template, locale).format({
        entity: "example",
      });
      expect(String(rendered)).not.toContain("RoutineDetail.empty");
    }
    for (const condition of CONDITION_KEYS) {
      new IntlMessageFormat(messageAt(messages, `RoutineDetail.empty.event.conditions.${condition}`), locale).format({
        fields: "name",
      });
    }
    for (const key of SCHEDULE_KEYS) messageAt(messages, `RoutineDetail.empty.schedule.${key}`);
  });
});
