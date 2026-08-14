const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/u;

export function hostnameFromHost(host: string): string {
  return host.split(":")[0] ?? "";
}

export function isSubdomainHost(host: string): boolean {
  const hostname = hostnameFromHost(host);

  if (hostname.includes("localhost")) return false;
  if (IPV4_LITERAL.test(hostname)) return false;

  return hostname.split(".").length > 2;
}
