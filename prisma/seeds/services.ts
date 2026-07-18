import type { Prisma } from "@/generated/prisma";

import type { SeedContext } from "./context";
import { fixtureId, upsertFixturesById } from "./helpers";

export const SYNTHETIC_SERVICE_NAMES = [
  "Data Migration",
  "Network Architecture Design",
  "Rack Server",
  "Custom Integrations",
  "Cloud Readiness Assessment",
  "Data Strategy Definition",
  "CI/CD Pipeline Setup",
  "Docking Station",
  "System Integrations",
  "Backend API Development",
  "Executive Enablement Workshop",
  "SAN Storage Array",
  "Analytics Use Case Development",
  "Frontend Development",
  "Go-Live Support",
  "Performance Testing",
  "Configuration Improvements",
  "Reporting & Dashboards",
  "Infrastructure Migration",
  "Network Interface Card",
  "Installation & Configuration",
  "User Training Session",
  "CRM Setup & Configuration",
  "HR System Audit",
  "Firewall Appliance",
  "Hypercare Support",
  "Process Analysis Workshop",
  "Security Review & Hardening",
  "Automation Development",
  "Post-Migration Support",
  "Device Provisioning & Imaging",
  "Documentation & Knowledge Transfer",
  "Change Management Support",
  "Data Warehouse Implementation",
  "Monitor 27”",
  "Admin Training",
  "Core Network Switch (48-port)",
  "Integration Architecture Design",
  "Platform Architecture Design",
  "Laptop (Business Class)",
  "Hardware Installation & Testing",
  "Extended Hardware Warranty (3y)",
  "Edge Network Switch (24-port)",
] as const;

export const SYNTHETIC_SERVICE_AMOUNTS = [
  25_000, 18_000, 18_500, 6_000, 18_000, 40_000, 16_000, 120, 14_000, 1_000, 10_000, 64_000, 12_000, 900, 15_000,
  18_000, 1_100, 10_000, 4_000, 950, 12_000, 2_500, 45_000, 15_000, 11_600, 14_000, 3_500, 12_500, 7_000, 5_000, 30,
  22_000, 1_200, 75_000, 280, 5_000, 9_200, 32_000, 35_000, 850, 21_700, 2_000, 4_800,
] as const;

export type ServiceDefinition = readonly [
  name: (typeof SYNTHETIC_SERVICE_NAMES)[number],
  amount: (typeof SYNTHETIC_SERVICE_AMOUNTS)[number],
];

export type ServiceFixture = {
  amount: ServiceDefinition[1];
  companyId: string;
  id: string;
  name: ServiceDefinition[0];
};

export type ServiceSeedData = {
  services: ServiceFixture[];
};

export async function seedServices(context: SeedContext): Promise<ServiceSeedData> {
  const serviceDefinitions = SYNTHETIC_SERVICE_NAMES.map(
    (name, index) => [name, SYNTHETIC_SERVICE_AMOUNTS[index]] as const,
  );
  const services = serviceDefinitions.map(
    ([name, amount], index) =>
      ({
        id: fixtureId("90000000", index + 1),
        amount,
        companyId: context.ids.company,
        name,
      }) satisfies Prisma.ServiceCreateManyInput,
  );

  await upsertFixturesById(services, (service) =>
    context.prisma.service.upsert({
      where: { id: service.id },
      update: service,
      create: service,
    }),
  );

  return { services };
}
