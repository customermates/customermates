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
} as const satisfies Record<string, { providers: readonly string[]; config?: Record<string, unknown> }>;

export type ConnectChannel = keyof typeof CONNECT_CHANNELS;

export const CONNECT_CHANNEL_KEYS = Object.keys(CONNECT_CHANNELS) as [ConnectChannel, ...ConnectChannel[]];
