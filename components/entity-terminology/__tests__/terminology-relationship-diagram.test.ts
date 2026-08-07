import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

import en from "@/i18n/locales/en.json";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const prefix = "EntityTerminology.relationships.";
    if (!key.startsWith(prefix)) return key;

    const message = (en.EntityTerminology.relationships as Record<string, string>)[key.slice(prefix.length)];
    if (!message) return key;

    return Object.entries(values ?? {}).reduce(
      (formatted, [name, value]) => formatted.replace(`{${name}}`, value),
      message,
    );
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
    expect(html.match(/data-selected=/g)).toHaveLength(5);
    expect(html).toContain("Follow-ups can be linked to any record in this model.");
    expect(html).toContain("Your data model: choose the names your team uses; relationships stay the same.");
    expect(html).not.toContain("—");
    expect(html).not.toContain("–");
    expect(html).toContain('aria-labelledby="terminology-task-relationship-label"');
    expect(html).toContain('id="terminology-task-relationship-label"');
    expect(html).toContain('role="group"');
    expect(html).toContain('data-task-selector="true" class="w-full"');
    expect(html).not.toContain("sm:w-[calc(50%-3rem)]");
    expect(html).not.toContain("Work items");
    expect(html).not.toMatch(/class="[^"]*\sborder-t(?:\s|")/);
    expect(html).not.toContain("rounded-xl");
    expect(html).not.toContain("bg-card/40");
    expect(html).not.toContain("Option A");
    expect(html).not.toContain("Temporary comparison");
    expect(html).not.toContain('role="tablist"');
  });

  it("renders all four record relationships, including Organization to Deal", () => {
    const html = renderToStaticMarkup(
      createElement(TerminologyRelationshipDiagram, {
        selections,
        onPreset: vi.fn(),
      }),
    );

    for (const relationship of ["contact-organization", "contact-deal", "organization-deal", "deal-service"])
      expect(html.match(new RegExp(`data-relationship="${relationship}"`, "g"))).toHaveLength(2);

    expect(html).toContain('<svg aria-hidden="true"');
    expect(html).toContain("text-border");
    expect(html).toContain("bg-border");
    expect(html.match(/stroke-width="1.5"/g)).toHaveLength(4);
    expect(html.match(/data-relationship-label=/g)).toHaveLength(4);
    expect(html.match(/data-slot="badge"/g)).toHaveLength(4);
    expect(html.match(/data-variant="secondary"/g)).toHaveLength(4);
    expect(html.match(/<li\s[^>]+data-relationship=/g)).toHaveLength(4);
    expect(html).toContain("Companies are linked to Jobs.");
    expect(html).not.toContain("border-l-");
  });

  it("keeps relationship descriptions accessible while hiding them visually on small screens", () => {
    const html = renderToStaticMarkup(
      createElement(TerminologyRelationshipDiagram, {
        selections,
        onPreset: vi.fn(),
      }),
    );

    expect(html).toContain('<div class="sr-only"><div class="flex flex-col gap-2">');
    expect(html).toContain("sr-only sm:not-sr-only");
    expect(html).toContain("relative flex min-h-6 w-full items-center justify-center sm:min-h-14 sm:py-2");
    expect(html).not.toContain("sm:sr-only");
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
    for (const entityType of Object.values(EntityType)) expect(html).not.toContain(`id="terminology-${entityType}"`);

    expect(html).toContain("Leads");
    expect(html).toContain("Companies");
    expect(html).toContain("Jobs");
    expect(html).toContain("Packages");
    expect(html).toContain("Follow-ups");
    expect(html).not.toContain("border-l-");
    expect(onPreset).not.toHaveBeenCalled();
  });
});
