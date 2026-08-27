import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
};

export default function StyleguideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
