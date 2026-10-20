import { operatorCollator } from "./operator-collator";

export function workspaceLabelFor(company: { id: string; name: string | null }, ownerEmail: string | null): string {
  if (company.name) return company.name;

  const shortId = company.id.slice(0, 8);

  return ownerEmail ? `${ownerEmail} · ${shortId}` : shortId;
}

export function deletedWorkspaceLabelFor(
  company: { id: string; name: string | null },
  members: readonly { email: string }[],
): string {
  if (company.name) return company.name;

  const counts = new Map<string, number>();
  for (const member of members) {
    const domain = member.email.split("@")[1];
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || operatorCollator().compare(a[0], b[0]));

  return ranked[0]?.[0] ?? company.id.slice(0, 8);
}
