import type { AiConnectionProvider } from "./ai-connection.store";

import { cn } from "@/core/utils/cn";

export type AiClientLogoProvider = AiConnectionProvider | "chatgpt" | "codex" | "grok";

type Props = {
  className?: string;
  provider: AiClientLogoProvider;
};

const commonProps = {
  "aria-hidden": true,
  focusable: "false",
} as const;

export function AiClientLogo({ provider, className }: Props) {
  const classes = cn("size-5 shrink-0", className);

  if (provider === "claude") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- one cached file instead of the long path inlined on every use
      <img
        aria-hidden
        alt=""
        className={classes}
        decoding="async"
        height={24}
        loading="lazy"
        src="/images/brand/claude-mark.svg"
        width={24}
      />
    );
  }

  if (provider === "openai" || provider === "chatgpt") {
    return (
      <svg {...commonProps} className={classes} fill="currentColor" viewBox="0 0 24 24">
        <path d="M22.3 10a5.5 5.5 0 0 0-.5-4.5A5.6 5.6 0 0 0 15.7 3a5.6 5.6 0 0 0-4.3-2 5.6 5.6 0 0 0-5.4 3.9A5.6 5.6 0 0 0 2.3 7.6a5.6 5.6 0 0 0 .7 6.6 5.6 5.6 0 0 0 .5 4.5 5.6 5.6 0 0 0 6 2.7 5.6 5.6 0 0 0 4.3 1.9 5.6 5.6 0 0 0 5.4-3.9 5.6 5.6 0 0 0 3.7-2.7 5.6 5.6 0 0 0-.6-6.7ZM13.9 21.7a4.1 4.1 0 0 1-2.7-1l.1-.1 4.5-2.6a.7.7 0 0 0 .4-.7v-6.4l1.9 1.1v5.3a4.2 4.2 0 0 1-4.2 4.2Zm-9-3.8a4.1 4.1 0 0 1-.5-2.8l.1.1 4.5 2.6a.7.7 0 0 0 .8 0l5.5-3.2v2.2l-4.6 2.6a4.2 4.2 0 0 1-5.7-1.5ZM3.7 8.8a4.1 4.1 0 0 1 2.2-1.9v5.4a.7.7 0 0 0 .4.7l5.5 3.2-1.9 1.1-4.6-2.6a4.2 4.2 0 0 1-1.6-5.9Zm15.6 3.6-5.5-3.2 1.9-1.1 4.6 2.6a4.2 4.2 0 0 1-.6 7.7v-5.4a.7.7 0 0 0-.4-.6Zm1.9-2.8-.1-.1-4.5-2.6a.7.7 0 0 0-.8 0L10.3 10V7.8l4.6-2.6a4.2 4.2 0 0 1 6.2 4.4ZM9.3 13.6l-1.9-1.1V7.3a4.2 4.2 0 0 1 6.9-3.2l-.1.1-4.5 2.6a.7.7 0 0 0-.4.7v6.1Zm1-2.2L12.8 10l2.5 1.4v2.9l-2.5 1.4L10.3 14.3v-2.9Z" />
      </svg>
    );
  }

  if (provider === "grok") {
    return (
      <svg {...commonProps} className={classes} fill="currentColor" viewBox="0 0 24 24">
        <path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815" />
      </svg>
    );
  }

  if (provider === "cursor") {
    return (
      <svg {...commonProps} className={classes} fill="currentColor" viewBox="0 0 466.73 532.09">
        <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
      </svg>
    );
  }

  if (provider === "gemini") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- preserves Google's self-contained published SVG asset verbatim.
      <img
        aria-hidden
        alt="Google Gemini"
        className={classes}
        decoding="async"
        height={24}
        loading="lazy"
        src="/images/brand/gemini-sparkle.svg"
        width={24}
      />
    );
  }

  return (
    <svg {...commonProps} className={classes} fill="none" viewBox="0 0 24 24">
      <rect fill="currentColor" height="16" rx="3" width="20" x="2" y="4" />

      <path
        d="m8 10-2 2 2 2m8-4 2 2-2 2m-2.5-5-3 6"
        stroke="var(--background)"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
