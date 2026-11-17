import { redirect } from "next/navigation";

import { connectionsRedirectTarget } from "@/features/connections/redirect-to-connections";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProfileApiKeysPage({ searchParams }: Props) {
  redirect(await connectionsRedirectTarget("api-keys", searchParams));
}
