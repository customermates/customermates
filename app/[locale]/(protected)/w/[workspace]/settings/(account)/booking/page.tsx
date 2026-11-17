import { redirect } from "next/navigation";

import { appRedirectHref } from "@/features/auth/next/app-redirect";

export default async function BookingLinksRedirectPage() {
  redirect(await appRedirectHref("/calendar?panel=booking"));
}
