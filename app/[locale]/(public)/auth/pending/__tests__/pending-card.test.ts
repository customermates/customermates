import type { ComponentType } from "react";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma";

import { APP_LOCALES } from "@/i18n/locale-registry";

type Workspace = { companyId: string; name: string | null; status: Status };

const harness = vi.hoisted(() => ({
  current: null as Workspace | null,
  dialogs: [] as Record<string, unknown>[],
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
  useRootStore: () => ({ workspacesStore: { current: harness.current, withdrawCurrentRequest: vi.fn() } }),
}));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));
vi.mock("@/components/modal/confirm-dialog", () => ({
  ConfirmDialog: (props: Record<string, unknown>) => {
    harness.dialogs.push(props);
    return null;
  },
}));

import { PendingCard } from "../pending-card";

type PendingCopy = { PendingCard: Record<string, string>; SignInForm: { signInCta: string } };

function catalog(locale: string): PendingCopy {
  return JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", `${locale}.json`), "utf8")) as PendingCopy;
}

function render() {
  return renderToStaticMarkup(createElement(PendingCard));
}

describe("PendingCard", () => {
  beforeEach(() => {
    harness.dialogs = [];
    harness.current = { companyId: "company-b", name: "Bergmann Steuern", status: Status.pendingAuthorization };
  });

  it("names the workspace the request waits for", () => {
    const html = render();

    expect(html).toContain("PendingCard.subtitle(workspace=Bergmann Steuern)");
    expect(html).toContain("PendingCard.body");
    expect(harness.dialogs.at(-1)).toMatchObject({
      description: "PendingCard.withdrawConfirmDescription",
      title: "PendingCard.withdrawConfirmTitle(name=Bergmann Steuern)",
    });
  });

  it("names a workspace without a name by the fallback name", () => {
    harness.current = { companyId: "company-b", name: null, status: Status.pendingAuthorization };

    expect(render()).toContain("PendingCard.subtitle(workspace=Workspaces.fallbackName)");
  });

  it.each(APP_LOCALES)("tells a signed-in person in %s that they wait for approval, not to sign in", (locale) => {
    const { PendingCard: copy, SignInForm } = catalog(locale);
    const signIn = SignInForm.signInCta.toLocaleLowerCase(locale);

    expect(copy.subtitle).toContain("{workspace}");
    expect(copy.subtitle.toLocaleLowerCase(locale)).not.toContain(signIn);
    expect(copy.body.toLocaleLowerCase(locale)).not.toContain(signIn);
  });
});
