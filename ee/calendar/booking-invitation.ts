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
  manage: { line: string; url: string } | null = null,
): { title: string; description: string } {
  const name = invitationName(visitorName);
  const who = name ? `${name} <${visitorEmail}>` : visitorEmail;
  const manageLine = manage ? stripControlCharacters(manage.line).trim() : "";

  return {
    title: name ? `${pageTitle} - ${name}` : pageTitle,
    description: manage ? `${who}\n\n${manageLine ? `${manageLine} ` : ""}${manage.url}` : who,
  };
}

export function bookingManageUrl(baseUrl: string, manageToken: string): string {
  return `${baseUrl.replace(/\/$/u, "")}/book/manage/${manageToken}`;
}
