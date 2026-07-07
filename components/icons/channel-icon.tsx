import type { ComponentProps } from "react";

import Image from "next/image";

type ChannelIconProps = Omit<ComponentProps<typeof Image>, "alt" | "src" | "width" | "height"> & {
  size?: number;
};

function makeChannelIcon(src: string, alt: string) {
  const Component = ({ className, size = 24, ...rest }: ChannelIconProps) => (
    <Image alt={alt} className={className} draggable={false} height={size} src={src} width={size} {...rest} />
  );
  Component.displayName = `ChannelIcon(${alt})`;
  return Component;
}

export const Linkedin = makeChannelIcon("/icons/channels/linkedin.svg", "LinkedIn");
export const Instagram = makeChannelIcon("/icons/channels/instagram.svg", "Instagram");
export const Whatsapp = makeChannelIcon("/icons/channels/whatsapp.svg", "WhatsApp");
export const Telegram = makeChannelIcon("/icons/channels/telegram.svg", "Telegram");
export const Google = makeChannelIcon("/icons/channels/google.svg", "Gmail");
export const Outlook = makeChannelIcon("/icons/channels/outlook.svg", "Outlook");
export const Mail = makeChannelIcon("/icons/channels/mail.svg", "IMAP");
export const GoogleCalendar = makeChannelIcon("/icons/channels/google-calendar.svg", "Google Calendar");
export const OutlookCalendar = makeChannelIcon("/icons/channels/outlook-calendar.svg", "Outlook Calendar");
export const Messenger = makeChannelIcon("/icons/channels/messenger.svg", "Messenger");
export const XTwitter = makeChannelIcon("/icons/channels/x.svg", "X");
