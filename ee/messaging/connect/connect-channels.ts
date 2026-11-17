export const CONNECT_CHANNELS = {
  google: { providers: ["google"] },
  outlook: { providers: ["outlook"] },
  imap: { providers: ["imap"] },
  whatsapp: { providers: ["whatsapp"] },
  linkedin: { providers: ["linkedin"] },
  linkedin_sales_navigator: {
    providers: ["linkedin"],
    config: { linkedin: { products: ["classic", "sales_navigator"] } },
  },
  linkedin_recruiter: {
    providers: ["linkedin"],
    config: { linkedin: { products: ["classic", "recruiter"] } },
  },
  instagram: { providers: ["instagram"] },
  telegram: { providers: ["telegram"] },
  facebook: { providers: ["facebook"] },
} as const satisfies Record<string, { providers: readonly string[]; config?: Record<string, unknown> }>;

export type ConnectChannel = keyof typeof CONNECT_CHANNELS;

export function isConnectChannelReleased(channel: ConnectChannel): boolean {
  return channel !== "facebook" || process.env.NEXT_PUBLIC_FACEBOOK_MESSENGER === "true";
}

export const CONNECT_CHANNEL_KEYS = (Object.keys(CONNECT_CHANNELS) as ConnectChannel[]).filter(
  isConnectChannelReleased,
) as [ConnectChannel, ...ConnectChannel[]];
