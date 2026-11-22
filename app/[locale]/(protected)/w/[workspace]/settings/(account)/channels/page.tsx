import { redirect } from "next/navigation";

import { connectionsRedirectHref } from "../components/connections-section";

import { appRedirectHref } from "@/features/auth/next/app-redirect";
import { env } from "@/env";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ChannelsRedirectPage({ searchParams }: Props) {
  const section = env.APP_MODE === "self-hosted" ? "apps" : "inbox";
  redirect(await appRedirectHref(connectionsRedirectHref(await searchParams, section)));
}
