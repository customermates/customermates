import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/styles/site", () => ({}));
vi.mock("../fonts", () => ({ latin: { variable: "font-variable", className: "font-class" } }));
vi.mock("@/core/errors/client-reporter", () => ({ captureError: vi.fn() }));
vi.mock("@/components/shared/error-page-view", () => ({
  ErrorPageView: ({ body }: { body: string }) => createElement("main", null, body),
}));

import { GLOBAL_ERROR_COPY } from "@/i18n/global-error-copy";
import GlobalError from "../global-error";

afterEach(() => vi.unstubAllEnvs());

describe("global error reporting copy", () => {
  it.each(["vercel", "off"])("uses the configured %s provider for the root fallback", (provider) => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", provider);
    const html = renderToStaticMarkup(createElement(GlobalError, { error: new Error("synthetic"), reset: vi.fn() }));
    expect(html).toContain(provider === "off" ? GLOBAL_ERROR_COPY.en.unreportedBody : GLOBAL_ERROR_COPY.en.body);
    expect(html).not.toMatch(/automatically notified/);
  });
});
