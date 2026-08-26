import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FrameDriver } from "./frame-driver";
import { resolveSceneName } from "./scene-names";

import { contentLocaleOrDefault } from "@/i18n/locale-registry";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Scene frame",
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scene?: string; t?: string }>;
};

export default async function SceneFramePage({ params, searchParams }: Props) {
  const { locale: requestedLocale } = await params;
  const { scene, t } = await searchParams;
  const parsed = Number.parseFloat(t ?? "0");
  const initial = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
  const name = resolveSceneName(scene);
  if (!name) notFound();
  const locale = contentLocaleOrDefault(requestedLocale);

  return (
    <div className="bg-background">
      <div data-scene-capture className="w-[1280px]">
        <FrameDriver initial={initial} locale={locale} scene={name} />
      </div>
    </div>
  );
}
