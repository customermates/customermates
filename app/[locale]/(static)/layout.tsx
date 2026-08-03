import { notFound } from "next/navigation";

import { Toaster } from "@/components/ui/sonner";
import { isContentLocale } from "@/i18n/locale-registry";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function StaticLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!isContentLocale(locale)) notFound();

  return (
    <>
      {children}

      <Toaster />
    </>
  );
}
