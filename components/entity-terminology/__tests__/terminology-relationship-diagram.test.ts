import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

import en from "@/i18n/locales/en.json";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === "EntityTerminology.relationships.linkedToAny")
      return `${values?.tasks} can be linked to any record above.`;
    if (key === "EntityTerminology.relationships.selectLabel") return `Name for ${values?.entity}`;
    return key;
  },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement("section", { "data-selected": value }, children),
  SelectTrigger: ({
    "aria-label": ariaLabel,
    children,
    id,
  }: {
    "aria-label": string;
    children: ReactNode;
    id: string;
  }) => createElement("button", { "aria-label": ariaLabel, id }, children),
  SelectContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement("span", { "data-option": value }, children),
}));

vi.mock("../use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    presetLabel: (entityType: EntityType, presetKey: string, form: "singular" | "plural") =>
      en.EntityTerminology.presets[entityType][
        presetKey as keyof (typeof en.EntityTerminology.presets)[typeof entityType]
      ][form],
  }),
}));

import { TerminologyRelationshipDiagram } from "../terminology-relationship-diagram";

const selections = {
  [EntityType.contact]: "lead",
  [EntityType.organization]: "company",
  [EntityType.deal]: "job",
  [EntityType.service]: "package",
  [EntityType.task]: "followUp",
};

describe("TerminologyRelationshipDiagram", () => {
  it("renders five editable selectors and the exact four Task options", () => {
    const html = renderToStaticMarkup(
      createElement(TerminologyRelationshipDiagram, {
        selections,
        onPreset: vi.fn(),
      }),
    );

    for (const entityType of Object.values(EntityType)) expect(html).toContain(`id="terminology-${entityType}"`);
    expect(html).toContain('aria-label="Name for Lead"');
    expect(html).toContain('aria-label="Name for Follow-up"');

    const taskSelect = html.match(/<section data-selected="followUp">([\s\S]*?)<\/section>/)?.[1] ?? "";
    expect([...taskSelect.matchAll(/data-option="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "task",
      "todo",
      "actionItem",
      "followUp",
    ]);
    expect(taskSelect).toContain("Follow-ups");
    expect(html).toContain("Follow-ups can be linked to any record above.");
  });

  it("renders five static labels and no selectors for read-only users", () => {
    const onPreset = vi.fn();
    const html = renderToStaticMarkup(
      createElement(TerminologyRelationshipDiagram, {
        readOnly: true,
        selections,
        onPreset,
      }),
    );

    expect(html).not.toContain("data-selected=");
    expect(html).not.toContain('id="terminology-');
    expect(html).toContain("Leads");
    expect(html).toContain("Companies");
    expect(html).toContain("Jobs");
    expect(html).toContain("Packages");
    expect(html).toContain("Follow-ups");
    expect(onPreset).not.toHaveBeenCalled();
  });
});
