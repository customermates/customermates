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
const picker = vi.hoisted(() => ({ value: undefined as unknown, getItems: undefined as unknown }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/forms/form-context", () => ({ useAppForm: () => ({ getValue: () => picker.value }) }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ userStore: { user: VIEWER } }) }));
vi.mock("@/app/[locale]/(protected)/settings/(workspace)/actions", () => ({ getActiveUsersAction: vi.fn() }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({
  lookupAddressAction: vi.fn(),
  verifyAddressAction: vi.fn(),
}));
vi.mock("@/components/forms/form-autocomplete-avatar", async () => {
  const React = await import("react");
  return {
    FormAutocompleteAvatar: ({
      items,
      getItems,
    }: {
      items: Array<{ id: string; firstName: string; lastName: string }>;
      getItems: unknown;
    }) => {
      picker.getItems = getItems;
      return React.createElement(
        "ul",
        null,
        items.map((item) => React.createElement("li", { key: item.id }, `${item.firstName} ${item.lastName}`)),
      );
    },
  };
});

import { getActiveUsersAction } from "@/app/[locale]/(protected)/settings/(workspace)/actions";
import { knownMembers, RecordInputField } from "../record-input-field";

const field = { id: "field", typeId: "type", label: "Owner", valueType: "member", required: false } as RecordFieldView;
const roots = new Set<Root>();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  picker.value = undefined;
  picker.getItems = undefined;
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
  it("knows the field's current member before the picker loads, not only the viewer", () => {
    picker.value = OWNER.id;
    expect(render([OWNER])).toEqual(["Otto Owner", "Viola Viewer"]);
    expect(render()).toEqual(["Viola Viewer"]);
  });

  it("loads new choices from active members only and does not offer members of other fields", () => {
    expect(render([OWNER])).toEqual(["Viola Viewer"]);
    expect(picker.getItems).toBe(getActiveUsersAction);
  });

  it("lists a member once when the record references the viewer", () => {
    expect(knownMembers([OWNER, { ...VIEWER }], VIEWER, VIEWER.id).map((member) => member.id)).toEqual([VIEWER.id]);
    expect(knownMembers([OWNER, { ...VIEWER }], VIEWER, OWNER.id).map((member) => member.id)).toEqual([
      OWNER.id,
      VIEWER.id,
    ]);
    expect(knownMembers([], null, undefined)).toEqual([]);
  });
});
