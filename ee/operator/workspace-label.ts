export function workspaceLabelFor(companyId: string, members: readonly { email: string }[]): string {
  const counts = new Map<string, number>();
  for (const member of members) {
    const domain = member.email.split("@")[1];
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  return ranked[0]?.[0] ?? companyId.slice(0, 8);
}
