import { describe, expect, it } from "vitest";

import { buildAppTopbarCrumbs } from "../app-topbar-crumbs";

const translate = (key: string) => key;
const OPAQUE_ID = "bcad5c22-5549-4847-93e4-c17296828b76";

describe("app topbar crumbs", () => {
  it("uses stable generic type and record identities through loading, renaming and navigation", () => {
    const read = (path: string, identity: Parameters<typeof buildAppTopbarCrumbs>[2]) =>
      buildAppTopbarCrumbs(path, translate, identity);
    expect(read("/en/records/type-id", null).crumbs).toEqual([{ label: "RecordModel.records", isLoading: true }]);
    const identity = {
      scope: "entity" as const,
      key: "records:type-id",
      title: "Projects",
      pictureUrl: null,
      avatarKind: null,
      record: { id: OPAQUE_ID, title: "Customer launch", pictureUrl: null, showAvatar: false },
    };
    expect(read(`/en/records/type-id/${OPAQUE_ID}`, identity).crumbs).toEqual([
      { label: "Projects", isLoading: false, href: "/records/type-id" },
      { label: "Customer launch", isLoading: false, isEntity: false, pictureUrl: null },
    ]);
    expect(read(`/en/records/type-id/another-record`, identity).crumbs.at(-1)).toMatchObject({
      label: "PageState.loading",
      isLoading: true,
    });
    expect(JSON.stringify(read(`/en/records/another-type/${OPAQUE_ID}`, identity))).not.toContain("Customer launch");
  });

  it("titles Configure as its own page without a section breadcrumb", () => {
    expect(buildAppTopbarCrumbs("/en/configure", translate, null)).toEqual({
      crumbs: [{ label: "RecordModel.configure" }],
    });
    const list = { scope: "entity" as const, key: "configure", title: "Deals", pictureUrl: null, avatarKind: null };
    expect(buildAppTopbarCrumbs("/en/configure", translate, list).crumbs).toEqual([
      { label: "RecordModel.configure", href: "/configure" },
      { label: "Deals" },
    ]);
  });

  it("titles settings pages under Settings, including the Deliveries tab of Webhooks", () => {
    expect(buildAppTopbarCrumbs("/en/settings/members", translate, null).crumbs).toEqual([
      { label: "NavigationBar.settings", href: "/settings/profile" },
      { label: "SettingsNav.members" },
    ]);
    expect(buildAppTopbarCrumbs("/en/settings/webhooks/deliveries", translate, null).crumbs).toEqual([
      { label: "NavigationBar.settings", href: "/settings/profile" },
      { label: "SettingsNav.webhooks" },
    ]);
    expect(buildAppTopbarCrumbs("/en/settings/billing", translate, null).crumbs.at(-1)).toEqual({
      label: "SettingsNav.billing",
    });
  });

  it.each([
    ["overview", "OperatorOverview.navigation"],
    ["users", "OperatorUsers.navigation"],
    ["workspaces", "OperatorWorkspaces.navigation"],
    ["audit", "OperatorAudit.navigation"],
  ])("renders the operator and %s crumbs when the operator console is visible", (route, leafLabel) => {
    expect(buildAppTopbarCrumbs(`/en/operator/${route}`, translate, null, null, true)).toEqual({
      crumbs: [{ href: "/operator/overview", label: "NavigationBar.operator" }, { label: leafLabel }],
    });
  });

  it.each(["overview", "users", "workspaces", "audit"])(
    "does not expose operator crumbs for %s when the operator console is hidden",
    (route) => {
      expect(buildAppTopbarCrumbs(`/en/operator/${route}`, translate, null, null, false)).toEqual({
        crumbs: [],
      });
    },
  );

  it("shows an inbox skeleton instead of a previous thread identity", () => {
    const result = buildAppTopbarCrumbs(
      "/en/inbox",
      translate,
      {
        scope: "inbox",
        key: "previous-thread",
        title: "Previous customer",
        pictureUrl: null,
        avatarKind: "messaging",
      },
      "current-thread",
    );

    expect(result.crumbs.at(-1)).toMatchObject({ isLoading: true, label: "PageState.loading" });
    expect(JSON.stringify(result)).not.toContain("Previous customer");
  });

  it("renders only the matching inbox thread identity", () => {
    const result = buildAppTopbarCrumbs(
      "/en/inbox",
      translate,
      {
        scope: "inbox",
        key: "current-thread",
        title: "Current customer",
        pictureUrl: "/current.png",
        avatarKind: "messaging",
      },
      "current-thread",
    );

    expect(result.crumbs.at(-1)).toMatchObject({
      isLoading: false,
      label: "Current customer",
      pictureUrl: "/current.png",
    });
  });
});
