import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  enabled: true,
  starredFieldIds: [] as string[],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { field?: string }) => {
    if (key === "Common.actions.openList") return "Open list";
    if (key === "EntityDetail.pinField") return `Pin ${values?.field} to the overview`;
    if (key === "EntityDetail.unpinField") return `Unpin ${values?.field} from the overview`;
    return key;
  },
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", { "data-slot": "tooltip" }, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-trigger" }, children),
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-content" }, children),
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));

vi.mock("@/components/entity-detail/entity-detail-personalization", () => ({
  useEntityDetailPersonalization: () => ({
    enabled: harness.enabled,
    starredFieldIds: harness.starredFieldIds,
    toggleStarredField: vi.fn(),
  }),
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entityType: string) => `${entityType[0].toUpperCase()}${entityType.slice(1)}s`,
  }),
}));

import { EntityRelationActions } from "../entity-relation-actions";

beforeEach(() => {
  harness.enabled = true;
  harness.starredFieldIds = [];
});

describe("EntityRelationActions", () => {
  it("renders matching pin and go-to actions for a persisted service relation", () => {
    harness.starredFieldIds = ["serviceIds"];
    const markup = renderToStaticMarkup(
      createElement(EntityRelationActions, {
        currentEntityId: "deal-1",
        currentEntityType: "deal",
        personalization: { fieldId: "serviceIds", label: "Services" },
        targetEntityType: "service",
      }),
    );

    expect(markup).toContain('aria-label="Unpin Services from the overview"');
    expect(markup).toContain('aria-label="Open list"');
    expect(markup).toContain('href="/services?filters=dealIds%3Ain%3Adeal-1"');
    expect(markup.match(/size-5/g)).toHaveLength(2);
    expect(markup.match(/size-3\.5/g)).toHaveLength(2);
    expect(markup).toContain("lucide-pin");
    expect(markup).not.toContain("lucide-star");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("fill-current text-primary");
    expect(markup.indexOf("Unpin Services from the overview")).toBeLessThan(markup.indexOf("Open list"));
  });

  it("keeps the go-to action without personalization and omits it until the record exists", () => {
    const persisted = renderToStaticMarkup(
      createElement(EntityRelationActions, {
        currentEntityId: "deal-1",
        currentEntityType: "deal",
        targetEntityType: "service",
      }),
    );
    const draft = renderToStaticMarkup(
      createElement(EntityRelationActions, {
        currentEntityId: undefined,
        currentEntityType: "deal",
        targetEntityType: "service",
      }),
    );

    expect(persisted).toContain('aria-label="Open list"');
    expect(persisted).not.toContain("overview");
    expect(draft).toBe("");
  });

  it("keeps the relation link when personalization is disabled", () => {
    harness.enabled = false;
    const markup = renderToStaticMarkup(
      createElement(EntityRelationActions, {
        currentEntityId: "deal-1",
        currentEntityType: "deal",
        personalization: { fieldId: "serviceIds" },
        targetEntityType: "service",
      }),
    );

    expect(markup).not.toContain("overview");
    expect(markup).toContain('aria-label="Open list"');
  });
});
