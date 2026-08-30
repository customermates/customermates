import { redirect } from "next/navigation";

export default async function OperatorIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/operator/overview`);
}
