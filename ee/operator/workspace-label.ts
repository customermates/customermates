export function workspaceLabelFor(company: { id: string; name: string | null }, ownerEmail: string | null): string {
  if (company.name) return company.name;

  const shortId = company.id.slice(0, 8);

  return ownerEmail ? `${ownerEmail} · ${shortId}` : shortId;
}
