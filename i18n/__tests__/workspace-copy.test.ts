import { readFileSync } from "node:fs";
import { join } from "node:path";

import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";

import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";

type MessageElement = {
  type: number;
  value?: unknown;
  options?: Record<string, { value: MessageElement[] }>;
  children?: MessageElement[];
};

const LITERAL_ELEMENT = 0;

const REJOIN_KEYS = [
  "Common.errors.workspaceMemberLeft",
  "MemberRemoval.consequences.rejoin",
  "PendingCard.withdrawConfirmDescription",
  "WorkspaceMembership.leftNotice",
  "WorkspaceRemovalNotice.rejoin",
  "Workspaces.leaveConfirmDescription",
] as const;

function leaves(value: unknown, prefix = ""): [string, unknown][] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

function messages(locale: AppLocale): Map<string, unknown> {
  const path = join(process.cwd(), "i18n", "locales", `${locale}.json`);
  return new Map(leaves(JSON.parse(readFileSync(path, "utf8"))));
}

function text(locale: AppLocale, key: string): string {
  const value = messages(locale).get(key);
  if (typeof value !== "string") throw new Error(`${locale}:${key} is not a message`);
  return value;
}

function prose(elements: MessageElement[]): string {
  return elements
    .map((element) => {
      if (element.type === LITERAL_ELEMENT) return String(element.value);
      if (element.options) {
        return Object.values(element.options)
          .map((option) => prose(option.value))
          .join(" ");
      }
      if (element.children) return prose(element.children);
      return "";
    })
    .join(" ");
}

function visibleWords(value: unknown, locale: AppLocale): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => visibleWords(item, locale));
  if (typeof value !== "string") return [];
  const ast = new IntlMessageFormat(value, locale, undefined, { ignoreTag: false }).getAst();
  return [prose(ast as MessageElement[])];
}

function comparable(value: string, locale: AppLocale) {
  return value.replaceAll("’", "'").toLocaleLowerCase(locale);
}

describe("workspace copy", () => {
  it("calls a workspace spazio di lavoro everywhere in the Italian copy", () => {
    const offenders = [...messages("it")]
      .filter(([, value]) => visibleWords(value, "it").some((words) => /workspace/iu.test(words)))
      .map(([key]) => key);

    expect(offenders).toEqual([]);
  });

  it("recognizes the English loanword in Italian prose but not in placeholders", () => {
    const mentions = (value: string) => visibleWords(value, "it").some((words) => /workspace/iu.test(words));

    expect(mentions("Esci dal workspace {workspace}")).toBe(true);
    expect(mentions("{count, plural, one {# workspace} other {# workspace}}")).toBe(true);
    expect(mentions("Unisciti a {workspace}")).toBe(false);
  });

  it.each(APP_LOCALES)(
    "tells a person who left, was removed or withdrew in %s to ask to join again with an invitation link",
    (locale) => {
      const invitationLink = comparable(text(locale, "CompanyInviteModal.label"), locale);

      for (const key of REJOIN_KEYS) expect(comparable(text(locale, key), locale), key).toContain(invitationLink);
    },
  );

  it("no longer tells anyone in English that a new invitation is needed", () => {
    for (const key of REJOIN_KEYS) {
      expect(text("en", key), key).not.toMatch(/new invitation|invite (?:you|them) again/iu);
      expect(text("en", key), key).toMatch(/approve/iu);
    }
  });
});
