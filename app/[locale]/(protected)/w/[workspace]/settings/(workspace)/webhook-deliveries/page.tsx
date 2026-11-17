import { redirect } from "next/navigation";

import { connectionsRedirectTarget } from "@/features/connections/redirect-to-connections";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CompanyWebhookDeliveriesPage({ searchParams }: Props) {
  redirect(await connectionsRedirectTarget("webhook-deliveries", searchParams));
}
