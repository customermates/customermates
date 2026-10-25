import { BlockList, isIP } from "node:net";

const IPV4_RESERVED = new BlockList();
const IPV6_GLOBAL = new BlockList();
const IPV6_RESERVED = new BlockList();

for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  IPV4_RESERVED.addSubnet(address, prefix, "ipv4");

IPV4_RESERVED.addAddress("168.63.129.16", "ipv4");
IPV6_GLOBAL.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3ffe::", 16],
  ["3fff::", 20],
] as const)
  IPV6_RESERVED.addSubnet(address, prefix, "ipv6");

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !IPV4_RESERVED.check(address, "ipv4");
  return family === 6 && IPV6_GLOBAL.check(address, "ipv6") && !IPV6_RESERVED.check(address, "ipv6");
}
