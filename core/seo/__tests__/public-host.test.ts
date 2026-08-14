import { describe, expect, it } from "vitest";

import { hostnameFromHost, isSubdomainHost } from "@/core/seo/public-host";

describe("public host classification", () => {
  it("strips a port before classifying", () => {
    expect(hostnameFromHost("customermates.com")).toBe("customermates.com");
    expect(hostnameFromHost("localhost:40196")).toBe("localhost");
    expect(hostnameFromHost("127.0.0.1:40196")).toBe("127.0.0.1");
    expect(hostnameFromHost("")).toBe("");
  });

  it.each([
    ["customermates.com", false],
    ["customermates.com:443", false],
    ["app.customermates.com", true],
    ["fix-page-shipping-contracts.customermates.com", true],
    ["customermates-git-main-customermates.vercel.app", true],
    ["localhost", false],
    ["localhost:40196", false],
    ["127.0.0.1", false],
    ["127.0.0.1:40196", false],
    ["0.0.0.0:3000", false],
    ["192.168.1.14:40196", false],
  ])("classifies %s as subdomain=%s", (host, expected) => {
    expect(isSubdomainHost(host)).toBe(expected);
  });

  it("keeps a bare two-label host a root host and a three-label host a subdomain", () => {
    expect(isSubdomainHost("example.com")).toBe(false);
    expect(isSubdomainHost("a.example.com")).toBe(true);
  });
});
