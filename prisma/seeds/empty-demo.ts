// Sandbox demo environments whose database must stay empty of business records.
// These deploy from `sandbox/<slug>` branches and expose `<slug>.customermates.com`;
// the seed still provisions identity (company, login users, roles, subscription) so
// the environment is signable-in, but skips every synthetic fixture.
const EMPTY_DEMO_REFS = new Set<string>(["sandbox/sell-ai-projects"]);

// Returns true when the current build must seed identity only and leave the CRM empty.
// Keyed on the Vercel branch ref (with a DEMO_EMPTY=1 escape hatch) so the default
// seed path — and every test that runs it without these vars — is untouched.
export function isEmptyDemo(): boolean {
  if (process.env.DEMO_EMPTY === "1") return true;
  const ref = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  return ref !== undefined && EMPTY_DEMO_REFS.has(ref);
}
