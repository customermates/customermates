import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import { SYNTHETIC_AVATAR_URLS } from "../avatars";
import type { PersonFixture, WorkspaceMessagingFixtures } from "../messaging/fixtures";
import type { RecordSpec, SolutionContent } from "./define-solution";
import type { SolutionRecordData } from "./solution-data";
import type { SolutionWorkspace } from "./solution-workspaces";

function personOf(workspace: SolutionWorkspace, content: SolutionContent, contact: RecordSpec): PersonFixture {
  const firstName = String(contact.values.firstName);
  const lastName = String(contact.values.lastName);
  const organizationKey = [contact.links?.["contact.organizations"] ?? []].flat()[0];
  const organization = content.records.organization?.find((entry) => entry.key === organizationKey);
  const jobTitle = typeof contact.values.jobTitle === "string" ? contact.values.jobTitle : null;
  const occupation =
    jobTitle && organization
      ? `${jobTitle}, ${String(organization.values.name)}`
      : (jobTitle ?? (organization ? String(organization.values.name) : undefined));
  const channels = contact.channels ?? {};
  return {
    displayName: `${firstName} ${lastName}`,
    ...(contact.avatar ? { avatarPath: contact.avatar } : {}),
    ...(channels.email ? { email: channels.email } : {}),
    ...(channels.phone ? { phone: channels.phone } : {}),
    ...(channels.linkedin
      ? { linkedin: channels.linkedin, profileUrl: channels.linkedinUrl, headline: occupation }
      : {}),
    ...(channels.instagram
      ? { instagram: channels.instagram, instagramProfileUrl: `https://instagram.example/${channels.instagram}` }
      : {}),
    ...(channels.telegram
      ? { telegram: channels.telegram, telegramProfileUrl: `https://telegram.example/${channels.telegram}` }
      : {}),
    ...(occupation ? { occupation } : {}),
  };
}

/**
 * The conversation fixtures of a workspace: the people are the contacts the threads name, threads keep their
 * explicit record links (never derived from participants), and the first LinkedIn contacts accepted a connection.
 */
export function buildSolutionMessaging(
  workspace: SolutionWorkspace,
  content: SolutionContent,
  data: SolutionRecordData,
): WorkspaceMessagingFixtures | null {
  const messaging = content.messaging;
  if (!messaging) return null;
  const contacts = new Map((content.records.contact ?? []).map((contact) => [contact.key, contact]));
  const people: Record<string, PersonFixture> = {};
  const addPerson = (key: string) => {
    if (key === "self" || people[key]) return;
    const contact = contacts.get(key);
    if (!contact) throw new Error(`${workspace.slug}: conversation with unknown contact ${key}`);
    people[key] = personOf(workspace, content, contact);
  };
  for (const thread of messaging.threads) {
    thread.with.forEach(addPerson);
    for (const message of thread.messages) {
      addPerson(message.from);
      if (message.reaction) addPerson(message.reaction.from);
    }
  }
  for (const event of messaging.calendar?.events ?? []) event.with.forEach(addPerson);

  const linkedinPeople = [
    ...new Set(messaging.threads.filter((thread) => thread.account === "linkedin").flatMap((thread) => thread.with)),
  ].slice(0, 2);

  return {
    companyId: workspace.companyId,
    userId: workspace.memberId,
    seedUserEmail: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
    tag: workspace.tag,
    self: {
      name: SYNTHETIC_COMPANY_USERS.maxBergmann.name,
      title: messaging.selfTitle,
      companyName: content.companyName,
      website: messaging.website,
      avatarPath: SYNTHETIC_AVATAR_URLS.maxBergmann,
    },
    accounts: messaging.accounts,
    people,
    threads: messaging.threads.map((thread) => ({
      account: thread.account,
      latestMinutesAgo: thread.latestMinutesAgo,
      name: thread.name ?? null,
      subject: thread.subject ?? null,
      state: thread.state,
      type: thread.with.length > 1 ? "group" : "single",
      participants: [...thread.with],
      messages: thread.messages.map((message) => ({
        sender: message.from,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.draft ? { draft: true } : {}),
        ...(message.reaction ? { reaction: { sender: message.reaction.from, value: message.reaction.value } } : {}),
      })),
      links: (thread.links ?? []).map((link) => {
        const ref = data.ids.get(link);
        if (!ref) throw new Error(`${workspace.slug}: conversation linked to unknown record ${link}`);
        return ref;
      }),
    })),
    calendar: messaging.calendar
      ? {
          name: messaging.calendar.name,
          timezone: content.timeZone,
          events: messaging.calendar.events.map((event) => ({
            title: event.title,
            attendees: event.with.map((person) => ({ person, responseStatus: "yes" as const })),
            durationMinutes: event.durationMinutes,
            startsMinutesAgo: event.startsMinutesAgo,
          })),
        }
      : null,
    linkedinActivities: linkedinPeople.map((person, index) => ({ person, occurredMinutesAgo: 30 * (index + 1) })),
  };
}
