import { Suspense } from "react";

import { OverlayGallery } from "./overlay-gallery";

export default function OverlayGalleryPage() {
  return (
    <Suspense>
      <OverlayGallery />
    </Suspense>
  );
}
