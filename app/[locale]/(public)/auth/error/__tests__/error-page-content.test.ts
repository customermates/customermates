import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/shared/error-page-view", () => ({
  ErrorPageView: (props: Record<string, unknown>) => {
    harness.props.push(props);
    return null;
  },
}));

import { ErrorPageContent } from "../error-page-content";

function renderedProps(errorKey: Parameters<typeof ErrorPageContent>[0]["errorKey"]) {
  renderToStaticMarkup(createElement(ErrorPageContent, { errorKey }));
  return harness.props.at(-1);
}

describe("ErrorPageContent", () => {
  beforeEach(() => {
    harness.props = [];
  });

  it("explains an onboarding link error and leads back home", () => {
    expect(renderedProps("inviteLinkExpired")).toEqual({
      backHref: "/",
      backLabel: "ErrorCard.ctaLabel",
      body: "ErrorCard.inviteLinkExpired",
      subtitle: "ErrorCard.subtitle",
      title: "ErrorCard.title",
    });
  });

  it("falls back to the support message without a known error", () => {
    expect(renderedProps(null)).toMatchObject({ body: "ErrorCard.contactSupport", backHref: "/" });
  });
});
