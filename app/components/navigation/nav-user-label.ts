export function navUserTriggerLabel(input: {
  name: string;
  email: string;
  menu: string;
  notVerified: string;
  emailVerified: boolean | null;
}): string {
  const parts = [input.name || input.email, input.menu];
  if (input.emailVerified === false) parts.push(input.notVerified);

  return parts.join(", ");
}
