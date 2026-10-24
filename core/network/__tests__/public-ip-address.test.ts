import { describe, expect, it } from "vitest";

import { isPublicIpAddress } from "../public-ip-address";

describe("isPublicIpAddress", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "100.100.100.200",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "168.63.129.16",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "::ffff:7f00:1",
    "64:ff9b::7f00:1",
    "64:ff9b:1::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001::1",
    "2001:2::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3ffe::1",
    "3fff::1",
    "not-an-address",
  ])("blocks non-public and transition address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "93.184.215.14", "172.32.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888"])(
    "accepts global public address %s",
    (address) => expect(isPublicIpAddress(address)).toBe(true),
  );
});
