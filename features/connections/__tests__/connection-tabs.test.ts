import { describe, expect, it } from "vitest";

import {
  CONNECTIONS_REDIRECTS,
  CONNECTION_TABS,
  connectionSectionsOf,
  connectionsHref,
  connectionsRedirectHref,
  resolveConnectionSection,
  resolveConnectionTab,
} from "../connection-tabs";

describe("connection tabs", () => {
  it("offers channels, apps, agents and developers in that order", () => {
    expect(CONNECTION_TABS).toEqual(["channels", "apps", "agents", "developers"]);
    expect(connectionSectionsOf("channels")).toEqual(["accounts"]);
    expect(connectionSectionsOf("developers")).toEqual(["keys", "webhooks", "deliveries", "incoming"]);
    expect(connectionSectionsOf("apps")).toEqual([]);
    expect(connectionSectionsOf("agents")).toEqual([]);
  });

  it("opens the requested tab when the person may see it and the first visible one otherwise", () => {
    expect(resolveConnectionTab("developers", CONNECTION_TABS)).toBe("developers");
    expect(resolveConnectionTab(["apps", "agents"], CONNECTION_TABS)).toBe("apps");
    expect(resolveConnectionTab("developers", ["apps", "agents"])).toBe("apps");
    expect(resolveConnectionTab(undefined, ["agents", "developers"])).toBe("agents");
    expect(resolveConnectionTab("nonsense", CONNECTION_TABS)).toBe("channels");
    expect(resolveConnectionTab("channels", [])).toBeNull();
  });

  it("opens the requested section of a tab and the first one otherwise", () => {
    expect(resolveConnectionSection("developers", "deliveries")).toBe("deliveries");
    expect(resolveConnectionSection("developers", "accounts")).toBe("keys");
    expect(resolveConnectionSection("channels", undefined)).toBe("accounts");
    expect(resolveConnectionSection("channels", ["keys"])).toBe("accounts");
    expect(resolveConnectionSection("apps", "keys")).toBeNull();
  });

  it("builds a short link that leaves out the default section", () => {
    expect(connectionsHref("channels")).toBe("/settings/connections?tab=channels");
    expect(connectionsHref("channels", "accounts")).toBe("/settings/connections?tab=channels");
    expect(connectionsHref("developers", "keys")).toBe("/settings/connections?tab=developers");
    expect(connectionsHref("developers", "incoming")).toBe("/settings/connections?tab=developers&section=incoming");
  });
});

describe("redirects from the old settings pages", () => {
  it("send every old slug to the tab and section that now holds it", () => {
    expect(Object.keys(CONNECTIONS_REDIRECTS).sort()).toEqual(
      ["agents", "api-keys", "channels", "incoming-webhooks", "webhook-deliveries", "webhooks"].sort(),
    );
    const none = new URLSearchParams();
    expect(connectionsRedirectHref("channels", none)).toBe("/settings/connections?tab=channels");
    expect(connectionsRedirectHref("agents", none)).toBe("/settings/connections?tab=agents");
    expect(connectionsRedirectHref("api-keys", none)).toBe("/settings/connections?tab=developers");
    expect(connectionsRedirectHref("webhooks", none)).toBe("/settings/connections?tab=developers&section=webhooks");
    expect(connectionsRedirectHref("webhook-deliveries", none)).toBe(
      "/settings/connections?tab=developers&section=deliveries",
    );
    expect(connectionsRedirectHref("incoming-webhooks", none)).toBe(
      "/settings/connections?tab=developers&section=incoming",
    );
  });

  it("keep the query the old link carried, so a connect result, saved view or filter survives", () => {
    const search = new URLSearchParams("account_id=abc&status=CREATION_SUCCESS&from=onboarding");

    expect(connectionsRedirectHref("channels", search)).toBe(
      "/settings/connections?tab=channels&account_id=abc&status=CREATION_SUCCESS&from=onboarding",
    );
    expect(connectionsRedirectHref("webhook-deliveries", new URLSearchParams("view=abc"))).toBe(
      "/settings/connections?tab=developers&section=deliveries&view=abc",
    );
  });

  it("do not let a carried tab or section override where the page now lives", () => {
    expect(connectionsRedirectHref("webhooks", new URLSearchParams("tab=apps&section=keys&x=1"))).toBe(
      "/settings/connections?tab=developers&section=webhooks&x=1",
    );
  });
});
