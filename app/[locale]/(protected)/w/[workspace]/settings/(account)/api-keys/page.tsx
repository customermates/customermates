import { redirect } from "next/navigation";

import { connectionsRedirectHref } from "../components/connections-section";

import { appRedirectHref } from "@/features/auth/next/app-redirect";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ApiKeysRedirectPage({ searchParams }: Props) {
  const params = await searchParams;
  redirect(await appRedirectHref(connectionsRedirectHref(params, params.connect ? "apps" : "keys")));
}
