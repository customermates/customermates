import { beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns/promises", () => ({ lookup: dns.lookup, default: { lookup: dns.lookup } }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));

import {
  isLocalWebhookHostname,
  isNonPublicAddress,
  isWebhookUrlHostBlocked,
  resolvePrivateDestinationPolicy,
  resolveWebhookDestination,
} from "../webhook-destination";
import { isNonRetryableWebhookStatus } from "../webhook-delivery-retry";

const BLOCKED_ADDRESSES = [
  "127.0.0.1",
  "127.255.255.254",
  "0.0.0.0",
  "0.1.2.3",
  "10.0.0.1",
  "10.255.255.255",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "100.64.0.1",
  "100.127.255.255",
  "169.254.169.254",
  "169.254.0.1",
  "192.0.0.8",
  "192.0.2.10",
  "198.18.0.1",
  "198.19.255.255",
  "198.51.100.7",
  "203.0.113.9",
  "224.0.0.1",
  "239.255.255.250",
  "240.0.0.1",
  "255.255.255.255",
  "::",
  "::1",
  "fe80::1",
  "fe80::1%eth0",
  "febf::1",
  "fc00::1",
  "fd12:3456:789a::1",
  "ff02::1",
  "::ffff:127.0.0.1",
  "::ffff:7f00:1",
  "0:0:0:0:0:ffff:a9fe:a9fe",
  "::ffff:10.0.0.1",
  "::ffff:192.168.0.1",
  "::127.0.0.1",
  "::ffff:0:10.0.0.1",
  "64:ff9b::10.0.0.1",
  "64:ff9b::a9fe:a9fe",
  "64:ff9b:1::1",
  "2002:7f00:1::1",
  "2002:c0a8:101::",
  "2001:db8::1",
  "2001::1",
  "100::1",
  "3fff::1",
  "not-an-address",
];

const PUBLIC_ADDRESSES = [
  "8.8.8.8",
  "1.1.1.1",
  "93.184.216.34",
  "172.15.255.255",
  "172.32.0.1",
  "100.63.255.255",
  "100.128.0.1",
  "169.253.255.255",
  "198.17.255.255",
  "198.20.0.1",
  "223.255.255.255",
  "2606:4700:4700::1111",
  "2a00:1450:4001:80b::200e",
  "::ffff:8.8.8.8",
  "64:ff9b::8.8.8.8",
  "2002:808:808::1",
];

describe("isNonPublicAddress", () => {
  it.each(BLOCKED_ADDRESSES)("blocks %s", (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each(PUBLIC_ADDRESSES)("allows the public address %s", (address) => {
    expect(isNonPublicAddress(address)).toBe(false);
  });
});

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

  it("returns the first resolved address when every record is public", async () => {
    dns.lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);

    await expect(resolveWebhookDestination("https://hooks.example.com/x", false)).resolves.toEqual({
      address: "93.184.216.34",
      family: 4,
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
    });
  });

  it("checks IP literals without resolving them", async () => {
    await expect(resolveWebhookDestination("http://0x7f.1/x", false)).resolves.toBeNull();
    await expect(resolveWebhookDestination("http://[::ffff:7f00:1]/x", false)).resolves.toBeNull();
    await expect(resolveWebhookDestination("https://8.8.8.8/x", false)).resolves.toEqual({
      address: "8.8.8.8",
      family: 4,
    });
    await expect(resolveWebhookDestination("http://[::1]:9/x", true)).resolves.toEqual({ address: "::1", family: 6 });
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

describe("isNonRetryableWebhookStatus", () => {
  it.each([301, 302, 307, 308, 400, 401, 403, 404, 422])("does not retry %s", (code) => {
    expect(isNonRetryableWebhookStatus(code)).toBe(true);
  });

  it.each([null, 200, 408, 425, 429, 500, 502, 503])("retries %s", (code) => {
    expect(isNonRetryableWebhookStatus(code)).toBe(false);
  });
});
