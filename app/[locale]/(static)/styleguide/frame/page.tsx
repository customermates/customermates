import type { Metadata } from "next";

import { FrameDriver } from "./frame-driver";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Scene frame",
};

type Props = {
  searchParams: Promise<{ t?: string }>;
};

export default async function SceneFramePage({ searchParams }: Props) {
  const { t } = await searchParams;
  const parsed = Number.parseFloat(t ?? "0");
  const initial = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;

  return (
    <div className="bg-background">
      <div data-scene-capture className="w-[1920px]">
        <FrameDriver initial={initial} />
      </div>
    </div>
  );
}
