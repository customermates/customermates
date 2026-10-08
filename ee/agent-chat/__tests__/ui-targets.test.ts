import { describe, expect, it } from "vitest";
import { Resource } from "@/generated/prisma";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, walkFiles } from "@/tests/conventions/walk";

import { CONTROL_PAGES, FORM_PAGES, formDiscardSuffix } from "../ui-anchors";
import {
  AGENT_UI_TARGETS,
  NavigationUiTargetIdSchema,
  UiTargetIdSchema,
  agentRouteVisible,
  agentSidebarGroupId,
  agentUiPageLabelKeys,
  findAgentNavigationTarget,
  findAgentUiTarget,
  isToolbarSearchTarget,
} from "../ui-targets";
import { SETTINGS_SECTIONS } from "@/app/components/navigation/settings-sections";

function componentSource(): string {
  return [
    ...walkFiles(join(REPO_ROOT, "app"), (path) => path.endsWith(".tsx")),
    ...walkFiles(join(REPO_ROOT, "components"), (path) => path.endsWith(".tsx")),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function rendersLiteralId(source: string, id: string) {
  const segment = /^(.+)-tab-([a-z0-9-]+)$/.exec(id);
  const rendersSegmentId =
    segment !== null &&
    source.includes(`idPrefix="${segment[1]}"`) &&
    source.includes(`{ value: "${segment[2]}", label:`);
  if (rendersSegmentId) return true;
  const footerScope = /^(.+)-(?:save|cancel|reset)$/.exec(id)?.[1];
  const rendersFooterId =
    footerScope !== undefined &&
    new RegExp(`<FormFooterActions\\b(?:=>|[^>])*?\\sanchorScope="${footerScope}"`).test(source);
  return (
    rendersFooterId || [`id="${id}"`, `inputId="${id}"`, `anchorId: "${id}"`].some((form) => source.includes(form))
  );
}

const controlTargetIds = CONTROL_PAGES.flatMap((page) =>
  page.controls.map((control) => `${page.scope}-${control.control}`),
);
const formTargetIds = FORM_PAGES.flatMap((page) => [`${page.scope}-save`, `${page.scope}${formDiscardSuffix(page)}`]);

describe("agent interface targets", () => {
  it("accepts only registered interface targets", () => {
    for (const id of ["nav-contacts", "contacts-add", "deals-search", "tasks-filter"]) {
      expect(findAgentUiTarget(id), id).toBeNull();
      expect(UiTargetIdSchema.safeParse(id).success, id).toBe(false);
      expect(NavigationUiTargetIdSchema.safeParse(id).success, id).toBe(false);
    }
    for (const target of AGENT_UI_TARGETS) expect(UiTargetIdSchema.safeParse(target.id).success).toBe(true);
    expect(NavigationUiTargetIdSchema.safeParse("nav-dashboard").success).toBe(true);
    expect(UiTargetIdSchema.safeParse("records:10000000-0000-4000-8000-000000000101:add").success).toBe(true);
  });

  it("registers every target id once", () => {
    const ids = AGENT_UI_TARGETS.map((target) => target.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it("offers the save and reset control of every form scope", () => {
    for (const id of formTargetIds) expect(findAgentUiTarget(id), id).not.toBeNull();
  });

  it("offers every declared page and dialog control", () => {
    for (const id of controlTargetIds) expect(findAgentUiTarget(id), id).not.toBeNull();
  });

  it("renders every form scope's save and reset ids through anchorScope", () => {
    const source = componentSource();
    for (const page of FORM_PAGES)
      expect(source, `anchorScope="${page.scope}" missing`).toContain(`anchorScope="${page.scope}"`);
  });

  it("renders every declared control id as a literal id in a component", () => {
    const source = componentSource();
    const missing = controlTargetIds.filter((id) => !rendersLiteralId(source, id));
    expect(missing, "control targets that no component renders").toEqual([]);
  });

  it("names a registered target on the same page or a named row or card as every prerequisite", () => {
    for (const target of AGENT_UI_TARGETS.filter((candidate) => candidate.prerequisite)) {
      const prerequisite = findAgentUiTarget(target.prerequisite ?? "");
      if (prerequisite) expect(prerequisite.route, `${target.id} prerequisite route`).toBe(target.route);
      else expect(target.prerequisite, `${target.id} prerequisite`).toMatch(/^an? [A-Za-z ]+ (?:row|card)$/);
    }
  });

  it("reaches every settings entry through the workspace menu without claiming it must be opened first", () => {
    for (const target of AGENT_UI_TARGETS.filter((candidate) => candidate.id.startsWith("nav-")))
      expect(target.prerequisite, target.id).toBeUndefined();
    for (const section of ["account", "workspace"] as const) {
      for (const subroute of SETTINGS_SECTIONS[section])
        expect(agentSidebarGroupId(`nav-settings-${subroute.slug}`), subroute.slug).toBe("nav-workspace-menu");
    }
    expect(agentSidebarGroupId("nav-workspace-menu")).toBeNull();
    expect(agentSidebarGroupId("nav-dashboard")).toBeNull();
    expect(agentSidebarGroupId("settings-members-add")).toBeNull();
    expect(agentSidebarGroupId("nav-settings-unknown")).toBeNull();
  });

  it("recognises the toolbar search boxes that narrow screens collapse", () => {
    expect(isToolbarSearchTarget("settings-webhooks-search")).toBe(true);
    expect(isToolbarSearchTarget("settings-webhooks-deliveries-search")).toBe(true);
    expect(isToolbarSearchTarget("nav-search")).toBe(false);
    expect(isToolbarSearchTarget("settings-roles-search")).toBe(false);
  });

  it("opens a page only when the sidebar would show it for the role and installation", () => {
    const reads =
      (...resources: Resource[]) =>
      (resource: Resource) =>
        resources.includes(resource);
    const everything = () => true;

    expect(agentRouteVisible("/settings/webhooks", "cloud", reads(Resource.users))).toBe(false);
    expect(agentRouteVisible("/settings/members", "cloud", reads(Resource.users))).toBe(true);
    expect(agentRouteVisible("/settings/api-keys", "cloud", reads(Resource.users))).toBe(false);
    expect(agentRouteVisible("/settings/profile", "cloud", reads())).toBe(true);
    expect(agentRouteVisible("/dashboard", "cloud", reads())).toBe(true);
    expect(agentRouteVisible("/routines", "cloud", reads(Resource.wiki))).toBe(false);
    expect(agentRouteVisible("/routines", "cloud", reads(Resource.routines))).toBe(true);
    expect(agentRouteVisible("/inbox", "cloud", everything)).toBe(true);
    for (const path of ["/inbox", "/routines", "/settings/channels", "/settings/billing"])
      expect(agentRouteVisible(path, "self-hosted", everything), path).toBe(false);
    expect(agentRouteVisible("*", "cloud", reads())).toBe(true);
  });

  it("names every routable target's page with the label keys the sidebar can show", () => {
    expect(agentUiPageLabelKeys("/settings/members")).toEqual(["SettingsNav.members"]);
    expect(agentUiPageLabelKeys("/settings/api-keys")).toEqual(["SettingsNav.apiKeys"]);
    expect(agentUiPageLabelKeys("/settings/webhooks/deliveries")).toEqual(["SettingsNav.webhooks"]);
    expect(agentUiPageLabelKeys("/inbox")).toEqual(["NavigationBar.inbox"]);
    expect(agentUiPageLabelKeys("/routines")).toEqual(["NavigationBar.routines"]);
    expect(agentUiPageLabelKeys("*")).toEqual([]);
    for (const target of AGENT_UI_TARGETS.filter((candidate) => candidate.route.startsWith("/")))
      expect(agentUiPageLabelKeys(target.route), target.id).not.toEqual([]);
  });

  it("names every sidebar entry whose label is not its page's label with the key the sidebar shows", () => {
    expect(findAgentUiTarget("nav-workspace-menu")?.labelKey).toBe("WorkspaceMenu.label");
    expect(findAgentUiTarget("nav-personal-menu")?.labelKey).toBe("UserAvatar.menu");
    expect(findAgentUiTarget("nav-search")?.labelKey).toBe("NavigationBar.search");
    for (const removed of ["nav-company", "nav-profile", "nav-documentation", "nav-feedback"])
      expect(findAgentUiTarget(removed), removed).toBeNull();
    const sidebar = readFileSync(join(REPO_ROOT, "app", "components", "app-sidebar.tsx"), "utf8");
    for (const target of AGENT_UI_TARGETS.filter((candidate) => candidate.id.startsWith("nav-"))) {
      expect(Boolean(target.labelKey) || agentUiPageLabelKeys(target.route).length > 0, target.id).toBe(true);
      if (target.labelKey) expect(sidebar, target.id).toContain(`t("${target.labelKey}")`);
    }
  });

  it("points dialog save and cancel or reset at what opens the dialog", () => {
    for (const page of FORM_PAGES) {
      const save = findAgentUiTarget(`${page.scope}-save`);
      const discard = findAgentUiTarget(`${page.scope}${formDiscardSuffix(page)}`);
      expect(save?.route, page.scope).toBe(page.route);
      expect(discard?.route, page.scope).toBe(page.route);
      expect(save?.prerequisite, page.scope).toBe(page.opener);
      expect(discard?.prerequisite, page.scope).toBe(page.resetOpener ?? page.opener);
    }
    expect(findAgentUiTarget("role-modal-save")?.prerequisite).toBe("settings-roles-add");
    expect(findAgentUiTarget("webhook-modal-cancel")?.prerequisite).toBe("settings-webhooks-add");
    expect(findAgentUiTarget("webhook-modal-reset")).toBeNull();
    expect(findAgentUiTarget("routine-modal-cancel")?.prerequisite).toBe("routines-add");
    expect(findAgentUiTarget("routine-modal-reset")).toBeNull();
    for (const id of ["member-modal-save", "member-modal-cancel"])
      expect(findAgentUiTarget(id)?.prerequisite, id).toBe("a member row");
    expect(findAgentUiTarget("widget-modal-save")?.prerequisite).toBe("widget-modal-kind");
    expect(findAgentUiTarget("widget-modal-kind")?.prerequisite).toBe("dashboard-add-widget");
    expect(findAgentUiTarget("widget-modal-reset")?.prerequisite).toBe("a widget card");
  });

  it("names the row or card that opens dialogs no target opens", () => {
    const expected: Record<string, string> = {
      "webhook-modal-delete": "a webhook row",
      "role-modal-delete": "a role row",
      "api-key-delete": "an API key card",
      "webhook-delivery-modal-resend": "a delivery row",
      "connected-account-tab-details": "a channel card",
      "connected-account-tab-email": "a channel card",
      "connected-account-tab-folders": "a channel card",
      "connected-account-visibility": "a channel card",
      "connected-account-resync": "a channel card",
      "connected-account-reactivate": "a channel card",
      "connected-account-disconnect": "a channel card",
    };
    for (const [id, opener] of Object.entries(expected)) expect(findAgentUiTarget(id)?.prerequisite, id).toBe(opener);
    expect(findAgentUiTarget("invite-modal-tab-email")?.prerequisite).toBe("settings-members-add");
    expect(findAgentUiTarget("invite-modal-send")?.prerequisite).toBe("invite-modal-tab-email");
  });

  it("routes record configuration and currencies to Configure, with no company settings page", () => {
    expect(findAgentUiTarget("nav-configure-records")?.route).toBe("/configure");
    expect(findAgentUiTarget("nav-company-data-model")).toBeNull();
    expect(findAgentUiTarget("nav-company-settings")).toBeNull();
    expect(findAgentUiTarget("company-settings-currency")).toBeNull();
    expect(findAgentUiTarget("nav-settings-members")?.route).toBe("/settings/members");
  });

  it("points dialog field targets at the control that opens their dialog or tab", () => {
    const prerequisiteOf = (id: string) => findAgentUiTarget(id)?.prerequisite;
    for (const id of ["invite-modal-tab-link", "invite-modal-link", "invite-modal-copy-link"])
      expect(prerequisiteOf(id), id).toBe("settings-members-add");
    expect(prerequisiteOf("invite-modal-emails")).toBe("invite-modal-tab-email");
    for (const control of ["url", "description", "events", "secret", "headers", "body-template", "enabled"])
      expect(prerequisiteOf(`webhook-modal-${control}`), control).toBe("settings-webhooks-add");
    expect(prerequisiteOf("api-key-option-standard")).toBe("settings-api-keys-generate");
    for (const id of ["api-key-name", "api-key-expires", "api-key-save"])
      expect(prerequisiteOf(id), id).toBe("api-key-option-standard");
    for (const id of ["connected-account-signature", "connected-account-email-save"])
      expect(prerequisiteOf(id), id).toBe("connected-account-tab-email");
    for (const control of ["email", "first-name", "last-name", "country", "role", "avatar-url", "status"])
      expect(prerequisiteOf(`member-modal-${control}`), control).toBe("a member row");
  });

  it("describes settings controls with the words users ask about", () => {
    const describes = (id: string, word: string) =>
      expect(findAgentUiTarget(id)?.description.toLowerCase(), id).toContain(word);
    describes("settings-billing-manage", "lemon squeezy");
    describes("settings-billing-manage", "invoices");
    describes("settings-profile-display-language", "language");
    describes("invite-modal-send", "invitations");
    describes("webhook-delivery-modal-resend", "resend");
  });

  it("describes when a form's save button exists and who sees conditional controls", () => {
    expect(findAgentUiTarget("settings-profile-save")?.description).toContain(
      "always shown, enabled once something changed",
    );
    expect(findAgentUiTarget("settings-profile-reset")?.description).toContain("shown once something changed");
    expect(findAgentUiTarget("member-modal-save")?.description).toContain("roles with Manage");
    expect(findAgentUiTarget("role-modal-save")?.description).toContain("not shown for the system role");
    expect(findAgentUiTarget("settings-billing-manage")?.description).toContain("Lemon Squeezy subscription");
    expect(findAgentUiTarget("settings-billing-manage")?.description).toContain("not on Enterprise");
    expect(findAgentUiTarget("settings-billing-refresh")?.description).toContain("not during the trial");
    expect(findAgentUiTarget("settings-billing-refresh")?.description).toContain("Lemon Squeezy subscription");
    expect(findAgentUiTarget("settings-billing-plan-picker")?.description).toContain("no Lemon Squeezy subscription");
    expect(findAgentUiTarget("settings-billing-plan-picker")?.description).toContain("not on Enterprise");
    expect(findAgentUiTarget("webhook-delivery-modal-resend")?.description).toContain("only on Delivered or Failed");
    expect(findAgentUiTarget("webhook-delivery-modal-resend")?.description).toContain("not Pending or Sending");
    for (const id of [
      "connected-account-resync",
      "connected-account-reactivate",
      "connected-account-disconnect",
      "connected-account-tab-email",
      "connected-account-visibility",
      "connected-account-signature",
    ])
      expect(findAgentUiTarget(id)?.description, id).toContain("you connected");
    expect(findAgentUiTarget("settings-profile-verify-email")?.description).toContain("unverified");
    expect(findAgentUiTarget("settings-api-keys-generate")?.description).toContain("API Manage");
    expect(findAgentUiTarget("connected-account-visibility")?.description).toContain("Business plan");
    expect(findAgentUiTarget("connected-account-tab-folders")?.description).toContain("accounts with folders");
    expect(findAgentUiTarget("role-modal-delete")?.description).toContain("not for the system role");
  });

  it("lets navigate resolve only targets with an app route", () => {
    for (const target of AGENT_UI_TARGETS)
      expect(findAgentNavigationTarget(target.id) !== null, target.id).toBe(target.route.startsWith("/"));
    for (const target of AGENT_UI_TARGETS) {
      const routable = target.route.startsWith("/");
      expect(NavigationUiTargetIdSchema.safeParse(target.id).success, target.id).toBe(routable);
      expect(UiTargetIdSchema.safeParse(target.id).success, target.id).toBe(true);
    }
    for (const id of [...formTargetIds, ...controlTargetIds])
      expect(findAgentNavigationTarget(id)?.route, id).toMatch(/^\//);
    expect(findAgentNavigationTarget("nav-search")).toBeNull();
    expect(UiTargetIdSchema.safeParse("currency").success).toBe(false);
    expect(UiTargetIdSchema.safeParse("settings-members-add-x").success).toBe(false);
  });
});
