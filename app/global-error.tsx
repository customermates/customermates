"use client";

import "@/styles/globals.css";

import { Inter } from "next/font/google";

import { ErrorPageView } from "@/components/shared/error-page-view";

const latin = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  return (
    <html className={`${latin.variable} ${latin.className} dark`} lang="en">
      <body className="h-screen flex flex-col font-sans antialiased">
        <ErrorPageView
          backHref="/"
          backLabel="Back to home"
          body="Don't worry, we've been automatically notified about this issue and are already looking into it. If you need immediate assistance, feel free to reach out to our support team."
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
