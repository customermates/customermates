import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { passthrough } = vi.hoisted(() => ({
  passthrough: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string>) =>
        values
          ? `${key}(${Object.entries(values)
              .map(([name, value]) => `${name}=${value}`)
              .join(",")})`
          : key,
      { rich: (key: string) => key },
    ),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/core/stores/root-store.provider", () => {
  const store = {
    form: {},
    isLoading: false,
    onInitOrRefresh: () => undefined,
    setWithUnsavedChangesGuard: () => undefined,
    showPassword: false,
    toggleShowPassword: () => undefined,
  };
  return { useRootStore: () => ({ appMode: "cloud", signInStore: store, signUpStore: store }) };
});
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));
vi.mock("@/components/forms/form-context", () => ({ AppForm: passthrough }));
vi.mock("@/components/forms/form-input", () => ({ FormInput: () => null }));
vi.mock("@/components/forms/form-checkbox", () => ({ FormCheckbox: () => null }));
vi.mock("@/components/forms/password-input", () => ({ PasswordInput: () => null }));
vi.mock("@/components/card/app-card", () => ({ AppCard: passthrough }));
vi.mock("@/components/card/app-card-body", () => ({ AppCardBody: passthrough }));
vi.mock("@/components/card/app-card-footer", () => ({ AppCardFooter: () => null }));
vi.mock("@/components/card/card-hero-header", () => ({ CardHeroHeader: () => null }));
vi.mock("@/components/shared/app-link", () => ({ AppLink: passthrough }));
vi.mock("@/components/shared/alert", () => ({ Alert: passthrough }));
vi.mock("@/components/shared/reveal", () => ({ Reveal: passthrough }));
vi.mock("@/components/ui/separator", () => ({ Separator: () => null }));
vi.mock("../../social-error-toast", () => ({ SocialErrorToast: () => null }));

import { SignInForm } from "../sign-in-form";
import { SignUpForm } from "../../signup/sign-up-form";

const socialProviders = { google: false, microsoft: false };
const inviterName = "Invite Admin";

function signIn(workspaceName?: string | null) {
  return renderToStaticMarkup(
    createElement(SignInForm, { inviterName, onboardingIntent: "signed.intent", socialProviders, workspaceName }),
  );
}

function signUp(workspaceName?: string | null) {
  return renderToStaticMarkup(
    createElement(SignUpForm, { invitationIntent: "signed.intent", inviterName, socialProviders, workspaceName }),
  );
}

describe("invitation subtitle on sign-in and sign-up", () => {
  it.each([
    ["sign-in", signIn, "SignInForm"],
    ["sign-up", signUp, "SignUpForm"],
  ])("names the invited workspace on %s", (_page, render, namespace) => {
    const markup = render("Hoffmann Consulting");

    expect(markup).toContain(
      `${namespace}.inviteSubtitleNamed(inviterName=${inviterName},workspace=Hoffmann Consulting)`,
    );
    expect(markup).not.toContain(`${namespace}.inviteSubtitle(`);
  });

  it.each([
    ["sign-in", signIn, "SignInForm"],
    ["sign-up", signUp, "SignUpForm"],
  ])("falls back to the unnamed invitation on %s when the workspace has no name", (_page, render, namespace) => {
    for (const workspaceName of [null, undefined, "  "]) {
      const markup = render(workspaceName);

      expect(markup).toContain(`${namespace}.inviteSubtitle(inviterName=${inviterName})`);
      expect(markup).not.toContain(`${namespace}.inviteSubtitleNamed`);
    }
  });
});
