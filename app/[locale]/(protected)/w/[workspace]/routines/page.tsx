import { redirect } from "next/navigation";

import { appRedirectHref } from "@/features/auth/next/app-redirect";

export default async function RoutinesPage() {
  redirect(await appRedirectHref("/automations?kind=routine"));
}
