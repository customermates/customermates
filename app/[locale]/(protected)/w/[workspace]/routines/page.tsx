import { redirect } from "next/navigation";

import { appRedirectHref } from "@/features/auth/next/app-redirect";

import { routinesRedirectPath } from "./routines-redirect";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RoutinesPage({ searchParams }: Props) {
  redirect(await appRedirectHref(routinesRedirectPath(await searchParams)));
}
