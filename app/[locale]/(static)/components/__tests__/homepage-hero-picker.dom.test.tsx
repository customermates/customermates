import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({
    appearance: _appearance,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { appearance?: string; children?: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

import { HomepageHeroPicker, homepageHeroCtaLabel } from "../homepage-hero-picker";
import { homepageHeroSignupHref } from "../homepage-hero-signup";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const choices = [
  { href: homepageHeroSignupHref("sales-pipeline"), label: "Sales leads", template: "sales-pipeline" },
  { href: homepageHeroSignupHref("form-to-crm"), label: "Website inquiries", template: "form-to-crm" },
  { href: homepageHeroSignupHref("booking-page"), label: "Bookings", template: "booking-page" },
];

function cta() {
  return container.querySelector<HTMLAnchorElement>("[data-homepage-hero-cta]");
}

function chip(template: string) {
  return container.querySelector<HTMLButtonElement>(`[data-template="${template}"]`);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <HomepageHeroPicker choices={choices} cta="Start free with {choice}" question="What do you want to follow up on?">
        <a href="#film">Watch the film</a>
      </HomepageHeroPicker>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("HomepageHeroPicker", () => {
  it("starts on the first template and links the call to action to signup with it", () => {
    expect(cta()?.textContent).toBe("Start free with Sales leads");
    expect(cta()?.getAttribute("href")).toBe("/auth/signup?job=followup&template=sales-pipeline");
    expect(chip("sales-pipeline")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[role="group"]')?.getAttribute("aria-labelledby")).toBe(
      container.querySelector("p")?.id,
    );
    expect(container.querySelector('a[href="#film"]')).not.toBeNull();
  });

  it("follows the chosen chip in the label and the signup template", () => {
    act(() => chip("booking-page")?.click());

    expect(cta()?.textContent).toBe("Start free with Bookings");
    expect(cta()?.getAttribute("href")).toBe("/auth/signup?job=followup&template=booking-page");
    expect(chip("booking-page")?.getAttribute("aria-pressed")).toBe("true");
    expect(chip("sales-pipeline")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("fills the choice into a call to action that puts it anywhere in the sentence", () => {
    expect(homepageHeroCtaLabel("Mit {choice} kostenlos starten", "Website-Anfragen")).toBe(
      "Mit Website-Anfragen kostenlos starten",
    );
  });
});
