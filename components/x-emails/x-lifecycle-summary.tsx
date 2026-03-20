import { SubscriptionStatus } from "@/generated/prisma";

import { XEmailLayout } from "@/components/x-emails/base/x-email-layout";
import { XEmailSection } from "@/components/x-emails/base/x-email-section";
import { XEmailText } from "@/components/x-emails/base/x-email-text";

type Props = {
  activeUsersLast24Hours: number;
  companies: {
    companyId: string;
    companyName: string;
    subscriptionStatus: SubscriptionStatus | null;
    users: {
      name: string;
      email: string;
      lastActivity: string;
    }[];
    entityCounts: {
      users: number;
      contacts: number;
      organizations: number;
      deals: number;
      services: number;
      tasks: number;
    };
  }[];
};

export default function XLifecycleSummary(props: Props) {
  return (
    <XEmailLayout preview="Lifecycle maintenance summary" title="Lifecycle maintenance summary">
      <XEmailSection>
        <XEmailText>
          <strong>Active users last 24 hours:</strong>

          {` ${props.activeUsersLast24Hours}`}
        </XEmailText>
      </XEmailSection>

      {props.companies.map((company) => (
        <XEmailSection key={company.companyId}>
          <XEmailText>
            <strong>{`${company.companyName} (Status: ${company.subscriptionStatus ?? "none"})`}</strong>
          </XEmailText>

          <XEmailText>
            {`Users: ${company.entityCounts.users}`}

            <br />

            {`Contacts: ${company.entityCounts.contacts}`}

            <br />

            {`Organizations: ${company.entityCounts.organizations}`}

            <br />

            {`Deals: ${company.entityCounts.deals}`}

            <br />

            {`Services: ${company.entityCounts.services}`}

            <br />

            {`Tasks: ${company.entityCounts.tasks}`}
          </XEmailText>

          <XEmailText>
            {company.users.map((user, index) => (
              <span key={`${company.companyId}-${user.email}-${index}`}>
                {`${user.name} (${user.email}) - ${user.lastActivity}`}

                <br />
              </span>
            ))}
          </XEmailText>
        </XEmailSection>
      ))}
    </XEmailLayout>
  );
}

XLifecycleSummary.PreviewProps = {
  activeUsersLast24Hours: 37,
  companies: [
    {
      companyId: "cmp_57a9fd",
      companyName: "Nova Logistics GmbH",
      subscriptionStatus: SubscriptionStatus.trial,
      users: [
        {
          name: "Sarah Connor",
          email: "sarah.connor@nova-logistics.com",
          lastActivity: "1. May 2026, 09:12",
        },
        {
          name: "David Hill",
          email: "david.hill@peak-ops.io",
          lastActivity: "No activity",
        },
      ],
      entityCounts: {
        users: 6,
        contacts: 112,
        organizations: 21,
        deals: 48,
        services: 14,
        tasks: 76,
      },
    },
  ],
};
