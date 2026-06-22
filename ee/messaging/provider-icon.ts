import type { MessagingProvider } from "@/generated/prisma";

import { Google, Instagram, Linkedin, Mail, Outlook, Telegram, Whatsapp } from "@/components/icons/channel-icon";
import { channelLabelKey } from "@/ee/messaging/provider";

export function getProviderIcon(provider: MessagingProvider) {
  switch (provider) {
    case "linkedin":
      return Linkedin;
    case "instagram":
      return Instagram;
    case "whatsapp":
      return Whatsapp;
    case "telegram":
      return Telegram;
    case "google":
      return Google;
    case "outlook":
      return Outlook;
    case "mail":
      return Mail;
    default:
      return Mail;
  }
}

export function getChannelIcon(provider: MessagingProvider) {
  return getProviderIcon(channelLabelKey(provider));
}
