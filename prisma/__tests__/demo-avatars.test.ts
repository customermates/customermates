import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import { SOLUTION_DATA_LOCALES } from "@/core/solutions/solution-catalog";

import { SYNTHETIC_AVATAR_ORIGIN } from "../seeds/avatars";
import { SYNTHETIC_COMPANY_MEMBER_DEFINITIONS } from "../seeds/members";
import { solutionContent } from "../seeds/solutions/define-solution";
import { SOLUTION_DEFINITIONS } from "../seeds/solutions/definitions";
import { solutionWorkspacePlan } from "../seeds/solutions/seed-solutions";
import { buildSolutionRecordData } from "../seeds/solutions/solution-data";
import { buildSolutionMessaging } from "../seeds/solutions/solution-messaging";
import { SOLUTION_WORKSPACES } from "../seeds/solutions/solution-workspaces";

const PEOPLE_DIRECTORY = join(process.cwd(), "public/demo/avatars/people");
const PHOTO_URL = new RegExp(`^${SYNTHETIC_AVATAR_ORIGIN}/demo/avatars/people/[A-Za-z0-9-]+\\.jpg$`);

function fileOf(url: string) {
  return basename(new URL(url).pathname);
}

const contacts = Object.entries(SOLUTION_DEFINITIONS).flatMap(([solution, definition]) =>
  SOLUTION_DATA_LOCALES.flatMap((locale) =>
    (solutionContent(definition, locale).records.contact ?? []).map((record) => ({ solution, locale, record })),
  ),
);

const colleagues = Object.entries(SOLUTION_DEFINITIONS).flatMap(([solution, definition]) =>
  SOLUTION_DATA_LOCALES.flatMap((locale) =>
    (solutionContent(definition, locale).members ?? []).map((member) => ({ solution, locale, member })),
  ),
);

describe("demo people photos", () => {
  it("gives every contact their own photo, named after the solution and the record key", () => {
    expect(contacts.length).toBeGreaterThan(300);
    for (const { solution, locale, record } of contacts) {
      expect(record.avatar, `${solution}/${locale}/${record.key}`).toMatch(PHOTO_URL);
      expect(fileOf(record.avatar ?? ""), `${solution}/${locale}/${record.key}`).toBe(`${solution}--${record.key}.jpg`);
    }
    const english = contacts.filter(({ locale }) => locale === "en");
    expect(new Set(english.map(({ record }) => record.avatar)).size).toBe(english.length);
  });

  it("keeps a person's photo the same in every data locale", () => {
    for (const [solution, definition] of Object.entries(SOLUTION_DEFINITIONS)) {
      const [first, ...others] = SOLUTION_DATA_LOCALES.map((locale) =>
        (solutionContent(definition, locale).records.contact ?? []).map(({ key, avatar }) => [key, avatar]),
      );
      for (const other of others) expect(other, solution).toEqual(first);
    }
  });

  it("gives every colleague and every team member their own team photo", () => {
    expect(colleagues.length).toBeGreaterThan(0);
    for (const { solution, locale, member } of colleagues) {
      expect(member.avatar, `${solution}/${locale}/${member.key}`).toMatch(PHOTO_URL);
      expect(fileOf(member.avatar)).toBe(`team--${solution}-${member.key}.jpg`);
    }
    const team = SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map(({ avatarPath }) => avatarPath);
    expect(team).toHaveLength(7);
    for (const avatar of team) expect(fileOf(avatar)).toMatch(/^team--[a-z]+-[a-z]+\.jpg$/);
    const all = [...colleagues.filter(({ locale }) => locale === "en").map(({ member }) => member.avatar), ...team];
    expect(new Set(all).size).toBe(all.length);
  });

  it("has exactly the photo files the seeds name", () => {
    const named = new Set([
      ...contacts.map(({ record }) => fileOf(record.avatar ?? "")),
      ...colleagues.map(({ member }) => fileOf(member.avatar)),
      ...SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map(({ avatarPath }) => fileOf(avatarPath)),
    ]);
    const present = new Set(readdirSync(PEOPLE_DIRECTORY));
    expect([...named].filter((file) => !present.has(file))).toEqual([]);
    expect([...present].filter((file) => !named.has(file))).toEqual([]);
    for (const file of named) expect(existsSync(join(PEOPLE_DIRECTORY, file)), file).toBe(true);
  });

  it("shows a contact in a conversation with the contact's own photo", () => {
    for (const plan of SOLUTION_WORKSPACES.map(solutionWorkspacePlan)) {
      const data = buildSolutionRecordData(plan.workspace, plan.content, plan.model);
      const messaging = buildSolutionMessaging(plan.workspace, plan.content, data);
      const byKey = new Map((plan.content.records.contact ?? []).map((record) => [record.key, record]));
      expect(Object.keys(messaging?.people ?? {}).length, plan.workspace.slug).toBeGreaterThan(0);
      for (const [key, person] of Object.entries(messaging?.people ?? {}))
        expect(person.avatarPath, `${plan.workspace.slug}/${key}`).toBe(byKey.get(key)?.avatar);
    }
  });
});
