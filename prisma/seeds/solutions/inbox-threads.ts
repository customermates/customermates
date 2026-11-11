import type { MessagingProvider, ThreadSpec } from "./define-solution";

export type InboxThreadPlan = {
  key: string;
  account: MessagingProvider;
  with: readonly string[];
  state: "open" | "unread";
  latestMinutesAgo: number;
  speakers: readonly string[];
  draft?: true;
  links: readonly string[];
  reactions?: ReadonlyArray<readonly [message: number, from: string, value: string]>;
};

export type InboxThreadText = {
  subject?: string;
  name?: string;
  messages: readonly string[];
};

const EMAIL_PROVIDERS: readonly MessagingProvider[] = ["google", "outlook"];

export function inboxThreads(
  plans: readonly InboxThreadPlan[],
  texts: Readonly<Record<string, InboxThreadText>>,
): ThreadSpec[] {
  return plans.map((plan) => {
    const text = texts[plan.key];
    if (!text) throw new Error(`Conversation ${plan.key} has no text`);
    if (text.messages.length !== plan.speakers.length)
      throw new Error(`Conversation ${plan.key} needs ${plan.speakers.length} messages, not ${text.messages.length}`);
    if (EMAIL_PROVIDERS.includes(plan.account) !== (text.subject !== undefined))
      throw new Error(`Conversation ${plan.key} has a subject exactly when it is an email`);
    const last = plan.speakers.length - 1;
    if (plan.draft && plan.speakers[last] !== "self")
      throw new Error(`Conversation ${plan.key} ends in a draft that Max did not write`);
    return {
      account: plan.account,
      with: plan.with,
      ...(text.subject === undefined ? {} : { subject: text.subject }),
      ...(text.name === undefined ? {} : { name: text.name }),
      state: plan.state,
      latestMinutesAgo: plan.latestMinutesAgo,
      messages: plan.speakers.map((from, index) => {
        const reaction = plan.reactions?.find(([message]) => message === index);
        return {
          from,
          text: text.messages[index],
          ...(plan.draft && index === last ? { draft: true } : {}),
          ...(reaction ? { reaction: { from: reaction[1], value: reaction[2] } } : {}),
        };
      }),
      links: plan.links,
    };
  });
}
