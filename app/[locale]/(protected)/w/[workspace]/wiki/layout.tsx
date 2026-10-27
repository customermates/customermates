import type { ReactNode } from "react";

import { WikiRouteScope } from "./components/wiki-route-scope";

export default function WikiLayout({ children }: { children: ReactNode }) {
  return <WikiRouteScope>{children}</WikiRouteScope>;
}
