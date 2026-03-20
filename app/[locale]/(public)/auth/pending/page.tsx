import { PendingCard } from "./pending-card";

import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";

export default function PendingPage() {
  return (
    <XPageCenter showGridBackground>
      <PendingCard />
    </XPageCenter>
  );
}
