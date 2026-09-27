import type { NextRequest } from "next/server";
import type { AppLocale } from "@/i18n/locale-registry";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const context = vi.hoisted(() => ({
  locale: "en" as AppLocale,
  invoke: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve(context.locale),
  getTranslations: async () => {
    const { getTranslator } = await import("@/i18n/get-translator");
    return getTranslator(context.locale);
  },
}));
vi.mock("@/core/di", () => ({
  getExportContactsPageInteractor: () => ({ invoke: context.invoke }),
  getExportDealsPageInteractor: () => ({ invoke: context.invoke }),
  getExportOrganizationsPageInteractor: () => ({ invoke: context.invoke }),
  getExportServicesPageInteractor: () => ({ invoke: context.invoke }),
  getExportTasksPageInteractor: () => ({ invoke: context.invoke }),
}));

import { POST } from "../route";

const NUL = "\u0000";
const COLUMNS = [{ key: "firstName", header: "First name" }];

function exportRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/export/contact", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as unknown as NextRequest;
}

const params = { params: Promise.resolve({ entityType: "contact" }) };

beforeEach(() => {
  context.locale = "en";
  vi.clearAllMocks();
});

describe("export route request validation", () => {
  it("answers a NUL character in the search term with the null-character message", async () => {
    const response = await POST(exportRequest({ columns: COLUMNS, searchTerm: `a${NUL}b` }), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toBe("✖ Must not contain null characters.\n  → at searchTerm");
    expect(context.invoke).not.toHaveBeenCalled();
  });

  it("answers a NUL character in a filter value with the null-character message", async () => {
    const response = await POST(
      exportRequest({ columns: COLUMNS, filters: [{ field: "firstName", operator: "contains", value: `a${NUL}` }] }),
      params,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toBe("✖ Must not contain null characters.\n  → at filters[0].value");
    expect(context.invoke).not.toHaveBeenCalled();
  });

  it("answers in the request's language", async () => {
    context.locale = "de";

    const response = await POST(exportRequest({ columns: COLUMNS, searchTerm: NUL }), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toBe("✖ Darf keine Null-Zeichen enthalten.\n  → at searchTerm");
  });
});
