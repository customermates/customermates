import type { Metadata } from "next";

import { FrameDriver } from "./frame-driver";
import { resolveSceneName } from "./scene-names";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Scene frame",
};

type Props = {
  searchParams: Promise<{ scene?: string; t?: string }>;
};

export default async function SceneFramePage({ searchParams }: Props) {
  const { scene, t } = await searchParams;
  const parsed = Number.parseFloat(t ?? "0");
  const initial = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
  const name = resolveSceneName(scene);

  return (
    <div className="bg-background">
      <div data-scene-capture className="w-[1280px]">
        <FrameDriver initial={initial} scene={name} />
      </div>
    </div>
  );
}
