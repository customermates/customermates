import type { ComponentType } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma";

type Workspace = { companyId: string; name: string | null; status: Status };

const harness = vi.hoisted(() => ({
  current: null as Workspace | null,
  others: [] as Workspace[],
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values
      ? `${key}(${Object.entries(values)
          .map(([name, value]) => `${name}=${value}`)
          .join(",")})`
      : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ workspacesStore: { current: harness.current, others: harness.others } }),
}));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));

import { InactiveCard } from "../inactive-card";

const inactive: Workspace = { companyId: "company-b", name: "Bergmann Steuern", status: Status.inactive };
const other: Workspace = { companyId: "company-a", name: "Hoffmann Consulting", status: Status.active };

function render() {
  return renderToStaticMarkup(createElement(InactiveCard));
}

describe("InactiveCard", () => {
  beforeEach(() => {
    harness.current = inactive;
    harness.others = [other];
  });

  it("names the deactivated workspace and who can reactivate it instead of showing an error", () => {
    const html = render();

    expect(html).toContain("<h1");
    expect(html).toContain("InactiveCard.title(workspace=Bergmann Steuern)");
    expect(html).toContain("InactiveCard.subtitle");
    expect(html).toContain("InactiveCard.body");
    expect(html).not.toContain("ErrorCard.");
  });

  it("points to the other workspaces only when the login has some", () => {
    expect(render()).toContain("InactiveCard.otherWorkspaces");

    harness.others = [];

    expect(render()).not.toContain("InactiveCard.otherWorkspaces");
  });

  it("keeps the refresh action", () => {
    expect(render()).toMatch(/<button[^>]*>Common\.actions\.refresh<\/button>/);
  });

  it("names a workspace without a name by the fallback name", () => {
    harness.current = { ...inactive, name: "  " };

    expect(render()).toContain("InactiveCard.title(workspace=Workspaces.fallbackName)");

    harness.current = null;

    expect(render()).toContain("InactiveCard.title(workspace=Workspaces.fallbackName)");
  });
});
