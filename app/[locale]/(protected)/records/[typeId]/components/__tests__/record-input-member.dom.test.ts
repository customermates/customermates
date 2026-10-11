import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordFieldView, RecordMember } from "@/features/records/record-model.schema";

const VIEWER = { id: "10000000-0000-4000-8000-000000000001", firstName: "Viola", lastName: "Viewer", avatarUrl: null };
const OWNER: RecordMember = {
  id: "10000000-0000-4000-8000-000000000002",
  firstName: "Otto",
  lastName: "Owner",
  avatarUrl: "https://example.test/otto.png",
};

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/forms/form-context", () => ({ useAppForm: () => null }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ userStore: { user: VIEWER } }) }));
vi.mock("@/app/[locale]/(protected)/settings/(workspace)/actions", () => ({ getUsersAction: vi.fn() }));
vi.mock("@/components/forms/form-autocomplete-avatar", async () => {
  const React = await import("react");
  return {
    FormAutocompleteAvatar: ({ items }: { items: Array<{ id: string; firstName: string; lastName: string }> }) =>
      React.createElement(
        "ul",
        null,
        items.map((item) => React.createElement("li", { key: item.id }, `${item.firstName} ${item.lastName}`)),
      ),
  };
});

import { knownMembers, RecordInputField } from "../record-input-field";

const field = { id: "field", typeId: "type", label: "Owner", valueType: "member", required: false } as RecordFieldView;
const roots = new Set<Root>();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.innerHTML = "";
});

function render(members?: RecordMember[]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  act(() => root.render(createElement(RecordInputField, { field, id: "values.field", members })));
  return [...host.querySelectorAll("li")].map((item) => item.textContent);
}

describe("RecordInputField member values", () => {
  it("knows the members the record references before the picker loads, not only the viewer", () => {
    expect(render([OWNER])).toEqual(["Otto Owner", "Viola Viewer"]);
    expect(render()).toEqual(["Viola Viewer"]);
  });

  it("lists a member once when the record references the viewer", () => {
    expect(knownMembers([OWNER, { ...VIEWER }], VIEWER).map((member) => member.id)).toEqual([OWNER.id, VIEWER.id]);
    expect(knownMembers([], null)).toEqual([]);
  });
});
