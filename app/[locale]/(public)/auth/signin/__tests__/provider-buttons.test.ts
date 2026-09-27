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
      (key: string, values?: { provider?: string }) => (values?.provider ? `${key}:${values.provider}` : key),
      {
        rich: (key: string) => key,
      },
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
  return { useRootStore: () => ({ appMode: "self-hosted", signInStore: store, signUpStore: store }) };
});
vi.mock("@/components/shared/app-image", () => ({
  AppImage: ({ alt }: { alt: string }) => createElement("img", { alt, "data-provider-icon": "" }),
}));
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

const socialProviders = { google: true, microsoft: true };

function providerButtons(markup: string) {
  return markup.split("<button").filter((button) => button.includes("data-provider-icon"));
}

describe("sign-in and sign-up provider buttons", () => {
  it.each([
    ["sign-in", () => renderToStaticMarkup(createElement(SignInForm, { socialProviders })), "SignInForm"],
    ["sign-up", () => renderToStaticMarkup(createElement(SignUpForm, { socialProviders })), "SignUpForm"],
  ])("stacks the %s provider buttons at every width so no label is cut short", (_form, render, namespace) => {
    const markup = render();
    const buttons = providerButtons(markup);

    expect(markup).toContain('<div class="flex flex-col items-center gap-4">');
    expect(markup).not.toContain("sm:flex-row");
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).not.toContain("sm:flex-1");
    expect(buttons[1]).toContain(`${namespace}.buttonLabel:Microsoft`);
  });

  it("names each provider button once, with a decorative icon", () => {
    const [google] = providerButtons(renderToStaticMarkup(createElement(SignInForm, { socialProviders })));

    expect(google).toContain('alt=""');
    expect(google.split("SignInForm.buttonLabel:Google")).toHaveLength(2);
  });
});
