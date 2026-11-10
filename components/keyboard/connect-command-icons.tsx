import type { AiConnectionProvider } from "@/components/ai-connection/ai-connection.store";
import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { CommandIcon } from "./command-registry";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { Google, Instagram, Linkedin, Mail, Outlook, Telegram, Whatsapp } from "@/components/icons/channel-icon";

export const CHANNEL_COMMAND_ICONS: Record<ConnectChannel, CommandIcon> = {
  google: Google,
  outlook: Outlook,
  imap: Mail,
  whatsapp: Whatsapp,
  linkedin: Linkedin,
  linkedin_sales_navigator: Linkedin,
  linkedin_recruiter: Linkedin,
  instagram: Instagram,
  telegram: Telegram,
};

function aiLogo(provider: AiConnectionProvider): CommandIcon {
  const Logo = ({ className }: { className?: string }) => <AiClientLogo className={className} provider={provider} />;
  Logo.displayName = `AiClientLogo(${provider})`;
  return Logo;
}

export const AI_CLIENT_COMMAND_ICONS: Record<AiConnectionProvider, CommandIcon> = {
  claude: aiLogo("claude"),
  openai: aiLogo("openai"),
  cursor: aiLogo("cursor"),
  gemini: aiLogo("gemini"),
};
