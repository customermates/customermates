import { Suspense } from "react";

import { OverlayGallery } from "./overlay-gallery";
import { requireAccess } from "@/features/auth/next/require";

export default async function OverlayGalleryPage() {
  await requireAccess();
  return (
    <Suspense>
      <OverlayGallery />
    </Suspense>
  );
}
