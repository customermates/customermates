import { beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns/promises", () => ({ lookup: dns.lookup, default: { lookup: dns.lookup } }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));

import {
  isLocalWebhookHostname,
  isWebhookUrlHostBlocked,
  resolvePrivateDestinationPolicy,
  resolveWebhookDestination,
} from "../webhook-destination";

describe("isWebhookUrlHostBlocked", () => {
  it.each([
    "http://127.0.0.1/hook",
    "http://127.0.0.1.:8080/hook",
    "http://2130706433/hook",
    "http://0x7f.1/hook",
    "http://0x7f000001/hook",
    "http://017700000001/hook",
    "http://0177.0.0.1/hook",
    "http://127.1/hook",
    "http://0/hook",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/hook",
    "http://[::ffff:127.0.0.1]/hook",
    "http://[::ffff:169.254.169.254]/hook",
    "http://[0:0:0:0:0:ffff:7f00:1]/hook",
    "http://[64:ff9b::10.0.0.1]/hook",
    "http://[fd00::1]/hook",
    "http://[fe80::1]/hook",
    "https://localhost/hook",
    "https://LOCALHOST./hook",
    "https://api.localhost/hook",
    "https://printer.local/hook",
    "https://service.internal/hook",
    "http://metadata.google.internal/computeMetadata/v1/",
  ])("rejects %s when private destinations are not allowed", (url) => {
    expect(isWebhookUrlHostBlocked(url, false)).toBe(true);
    expect(isWebhookUrlHostBlocked(url, true)).toBe(false);
  });

  it.each(["https://hooks.example.com/x", "https://8.8.8.8/x", "http://n8n:5678/webhook", "https://[2606:4700::1]/x"])(
    "leaves %s for the delivery-time check",
    (url) => {
      expect(isWebhookUrlHostBlocked(url, false)).toBe(false);
    },
  );
});

describe("isLocalWebhookHostname", () => {
  it.each(["localhost", "a.b.localhost", "nas.local", "db.internal", "metadata.google.internal", "LocalHost."])(
    "treats %s as local",
    (hostname) => {
      expect(isLocalWebhookHostname(hostname)).toBe(true);
    },
  );

  it.each(["example.com", "localhost.example.com", "internal.example.com", "local"])(
    "treats %s as remote",
    (hostname) => {
      expect(isLocalWebhookHostname(hostname)).toBe(false);
    },
  );
});

describe("resolvePrivateDestinationPolicy", () => {
  it.each([
    [{ appMode: "cloud" as const }, false],
    [{ appMode: "demo" as const }, false],
    [{ appMode: "cloud" as const, allowPrivateDestinations: true }, true],
    [{ appMode: "demo" as const, allowPrivateDestinations: true }, true],
    [{ appMode: "self-hosted" as const }, true],
    [{ appMode: "self-hosted" as const, blockPrivateDestinations: true }, false],
    [{ appMode: "cloud" as const, allowPrivateDestinations: true, blockPrivateDestinations: true }, false],
  ])("resolves %o to %s", (input, expected) => {
    expect(resolvePrivateDestinationPolicy(input)).toBe(expected);
  });
});

describe("resolveWebhookDestination", () => {
  beforeEach(() => {
    dns.lookup.mockReset();
  });

  it("returns every resolved address, first one preferred, when every record is public", async () => {
    dns.lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);

    await expect(resolveWebhookDestination("https://hooks.example.com/x", false)).resolves.toEqual({
      address: "93.184.216.34",
      family: 4,
      addresses: [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ],
    });
    expect(dns.lookup).toHaveBeenCalledWith("hooks.example.com", { all: true, verbatim: true });
  });

  it.each([
    [
      [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    ],
    [
      [
        { address: "93.184.216.34", family: 4 },
        { address: "::1", family: 6 },
      ],
    ],
    [[{ address: "10.1.2.3", family: 4 }]],
    [[{ address: "::ffff:169.254.169.254", family: 6 }]],
    [[]],
  ])("blocks a hostname when any resolved record is non-public: %o", async (records) => {
    dns.lookup.mockResolvedValueOnce(records);

    await expect(resolveWebhookDestination("https://rebind.example.com/x", false)).resolves.toBeNull();
  });

  it("allows a hostname resolving to a private address when private destinations are allowed", async () => {
    dns.lookup.mockResolvedValueOnce([{ address: "172.18.0.5", family: 4 }]);

    await expect(resolveWebhookDestination("http://n8n:5678/webhook", true)).resolves.toEqual({
      address: "172.18.0.5",
      family: 4,
      addresses: [{ address: "172.18.0.5", family: 4 }],
    });
  });

  it("checks IP literals without resolving them", async () => {
    await expect(resolveWebhookDestination("http://0x7f.1/x", false)).resolves.toBeNull();
    await expect(resolveWebhookDestination("http://[::ffff:7f00:1]/x", false)).resolves.toBeNull();
    await expect(resolveWebhookDestination("https://8.8.8.8/x", false)).resolves.toEqual({
      address: "8.8.8.8",
      family: 4,
      addresses: [{ address: "8.8.8.8", family: 4 }],
    });
    await expect(resolveWebhookDestination("http://[::1]:9/x", true)).resolves.toEqual({
      address: "::1",
      family: 6,
      addresses: [{ address: "::1", family: 6 }],
    });
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("refuses local names without resolving them", async () => {
    await expect(resolveWebhookDestination("http://metadata.google.internal/x", false)).resolves.toBeNull();
    await expect(resolveWebhookDestination("http://localhost:4000/x", false)).resolves.toBeNull();
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("refuses a non-HTTP scheme", async () => {
    await expect(resolveWebhookDestination("mailto:ops@example.com", true)).resolves.toBeNull();
    await expect(resolveWebhookDestination("ftp://example.com/x", true)).resolves.toBeNull();
  });
});
