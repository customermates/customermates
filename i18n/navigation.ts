import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

export const { redirect } = createNavigation(routing);

export {
  FallbackWorkspaceSlugProvider,
  IntlLink,
  usePathname,
  useRouter,
  useWorkspaceSlug,
  workspaceHref,
} from "./workspace-navigation";
