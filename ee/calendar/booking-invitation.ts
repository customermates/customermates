import { stripControlCharacters } from "@/core/utils/strip-control-characters";

const NAME_MAX_CHARS = 80;

export function invitationName(name: string): string {
  return stripControlCharacters(name)
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S*/giu, " ")
    .replace(/\bwww\.\S*/giu, " ")
    .replace(/[<>[\]()]/gu, " ")
    .replace(/(?<=[^\s.])[./@](?=[^\s.])/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, NAME_MAX_CHARS)
    .trim();
}

export function bookingInvitation(
  pageTitle: string,
  visitorName: string,
  visitorEmail: string,
): { title: string; description: string } {
  const name = invitationName(visitorName);

  return {
    title: name ? `${pageTitle} - ${name}` : pageTitle,
    description: name ? `${name} <${visitorEmail}>` : visitorEmail,
  };
}
