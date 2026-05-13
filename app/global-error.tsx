"use client";

import "@/styles/globals.css";

import { ErrorPageView } from "@/components/shared/error-page-view";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  return (
    <html lang="en">
      <body>
        <ErrorPageView
          useNativeAnchor
          backHref="/"
          backLabel="Back to home"
          body={`Don't worry, we've been automatically notified about this issue and are already looking into it. If you need immediate assistance, feel free to reach out to our support team.`}
          error={error}
          retryLabel="Try again"
          subtitle="Oops! Something went wrong"
          title="Well, that's awkward"
          onRetry={() => reset()}
        />
      </body>
    </html>
  );
}
