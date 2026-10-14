import type { RecordIdentityProvider } from "@/generated/prisma";

import { Google, Instagram, Linkedin, Mail, Outlook, Phone, Telegram, Whatsapp } from "@/components/icons/channel-icon";
import { channelLabelKey } from "@/ee/messaging/provider";

export function getProviderIcon(provider: RecordIdentityProvider) {
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
    case "phone":
      return Phone;
    default:
      return Mail;
  }
}

export function getChannelIcon(provider: RecordIdentityProvider) {
  return getProviderIcon(channelLabelKey(provider));
}
