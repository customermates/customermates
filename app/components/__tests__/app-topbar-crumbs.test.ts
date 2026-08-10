import { describe, expect, it } from "vitest";

import { buildAppTopbarCrumbs } from "../app-topbar-crumbs";

const ENTITY_LABELS = {
  contacts: "Contacts",
  organizations: "Organizations",
  deals: "Deals",
  services: "Services",
  tasks: "Tasks",
};
const translate = (key: string) => key;
const canAccess = () => true;
const OPAQUE_ID = "bcad5c22-5549-4847-93e4-c17296828b76";

describe("app topbar crumbs", () => {
  it.each(["contacts", "organizations", "deals", "services", "tasks"])(
    "uses a loading crumb instead of exposing the %s route key",
    (section) => {
      const result = buildAppTopbarCrumbs(
        `/en/${section}/${OPAQUE_ID}`,
        translate,
        ENTITY_LABELS,
        null,
        "cloud",
        canAccess,
      );
      const leaf = result.crumbs.at(-1);

      expect(leaf).toMatchObject({
        isLoading: true,
        label: "PageState.loading",
      });
      expect(JSON.stringify(result)).not.toContain(OPAQUE_ID);
      expect(JSON.stringify(result)).not.toContain(OPAQUE_ID.slice(0, 8));
    },
  );

  it("ignores an identity from a previous route", () => {
    const result = buildAppTopbarCrumbs(
      `/en/contacts/${OPAQUE_ID}`,
      translate,
      ENTITY_LABELS,
      {
        scope: "entity",
        key: "contacts:previous-id",
        title: "Previous customer",
        pictureUrl: null,
        avatarKind: "contact",
      },
      "cloud",
      canAccess,
    );

    expect(result.crumbs.at(-1)).toMatchObject({
      isLoading: true,
      label: "PageState.loading",
    });
    expect(JSON.stringify(result)).not.toContain("Previous customer");
  });

  it("renders a matching resolved identity", () => {
    const result = buildAppTopbarCrumbs(
      `/en/contacts/${OPAQUE_ID}`,
      translate,
      ENTITY_LABELS,
      {
        scope: "entity",
        key: `contacts:${OPAQUE_ID}`,
        title: "Ada Lovelace",
        pictureUrl: "/ada.png",
        avatarKind: "contact",
      },
      "cloud",
      canAccess,
    );

    expect(result.crumbs.at(-1)).toMatchObject({
      isLoading: false,
      label: "Ada Lovelace",
      pictureUrl: "/ada.png",
      isEntity: true,
    });
  });

  it("shows an inbox skeleton instead of a previous thread identity", () => {
    const result = buildAppTopbarCrumbs(
      "/en/inbox",
      translate,
      ENTITY_LABELS,
      {
        scope: "inbox",
        key: "previous-thread",
        title: "Previous customer",
        pictureUrl: null,
        avatarKind: "messaging",
      },
      "cloud",
      canAccess,
      "current-thread",
    );

    expect(result.crumbs.at(-1)).toMatchObject({ isLoading: true, label: "PageState.loading" });
    expect(JSON.stringify(result)).not.toContain("Previous customer");
  });

  it("renders only the matching inbox thread identity", () => {
    const result = buildAppTopbarCrumbs(
      "/en/inbox",
      translate,
      ENTITY_LABELS,
      {
        scope: "inbox",
        key: "current-thread",
        title: "Current customer",
        pictureUrl: "/current.png",
        avatarKind: "messaging",
      },
      "cloud",
      canAccess,
      "current-thread",
    );

    expect(result.crumbs.at(-1)).toMatchObject({
      isLoading: false,
      label: "Current customer",
      pictureUrl: "/current.png",
    });
  });
});
