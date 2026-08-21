import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SYNTHETIC_COMPANY_USERS,
  SYNTHETIC_SEED_USER,
  SYNTHETIC_SHARED_USER_PASSWORD,
} from "@/core/config/synthetic-seed-user";

import { SYNTHETIC_AVATAR_ORIGIN, SYNTHETIC_AVATAR_URLS, SYNTHETIC_CONTACT_AVATAR_URLS } from "../seeds/avatars";
import {
  SYNTHETIC_CONTACT_EMAIL_ADDRESSES,
  SYNTHETIC_CONTACT_NAMES,
  SYNTHETIC_CONTACT_ORGANIZATION_LINKS,
} from "../seeds/contacts";
import { SEED_IDS } from "../seeds/context";
import { SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS, SYNTHETIC_CUSTOM_OPTION_IDS } from "../seeds/custom-fields";
import { SYNTHETIC_DEAL_NAMES, SYNTHETIC_DEAL_ORGANIZATION_LINKS, SYNTHETIC_SERVICE_DEAL_LINKS } from "../seeds/deals";
import { fixtureId } from "../seeds/helpers";
import { SYNTHETIC_AUTH_IDENTITY_DEFINITIONS, SYNTHETIC_SUBSCRIPTION } from "../seeds/identity";
import { SYNTHETIC_COMPANY_MEMBER_DEFINITIONS } from "../seeds/members";
import { SYNTHETIC_ORGANIZATION_DEFINITIONS, SYNTHETIC_ORGANIZATION_NAMES } from "../seeds/organizations";
import { SYNTHETIC_ROLE_DEFINITIONS, SYNTHETIC_ROLE_PERMISSION_COUNT } from "../seeds/roles";
import { SYNTHETIC_SERVICE_NAMES } from "../seeds/services";
import {
  SYNTHETIC_ASSIGNED_TASK_INDEXES,
  SYNTHETIC_TASK_CONTACT_LINKS,
  SYNTHETIC_TASK_DEAL_LINKS,
  SYNTHETIC_TASK_NAMES,
  SYNTHETIC_TASK_ORGANIZATION_LINKS,
  SYNTHETIC_TASK_SERVICE_LINKS,
} from "../seeds/tasks";
import { SYNTHETIC_SEED_TIMELINE } from "../seeds/timeline";
import { SYNTHETIC_WIDGET_NAMES } from "../seeds/widgets";

const SYNTHETIC_FIXTURE_COUNTS = {
  auditLogs: 161,
  authAccounts: 3,
  authUsers: 3,
  contacts: 30,
  customColumns: 10,
  customFieldValues: 234,
  deals: 10,
  organizations: 19,
  p13n: 10,
  services: 43,
  tasks: 15,
  rolePermissions: 46,
  roles: 3,
  users: 3,
  webhookDeliveries: 14,
  webhooks: 1,
  widgets: 7,
} as const;

const SYNTHETIC_RELATIONSHIP_COUNTS = {
  contactOrganizations: 30,
  contactUsers: 30,
  dealContacts: 0,
  dealOrganizations: 10,
  dealUsers: 10,
  organizationUsers: 19,
  serviceDeals: 43,
  serviceUsers: 43,
  taskContacts: 5,
  taskDeals: 4,
  taskOrganizations: 3,
  taskServices: 1,
  taskUsers: 14,
} as const;

function lines(value: string): string[] {
  return value.trim().split("\n");
}

type IndexLink = readonly [number, number, ...number[]];

function linkString(links: ReadonlyArray<IndexLink>): string {
  return links.map((link) => link.join(":")).join("|");
}

function expectValidLinks(links: ReadonlyArray<IndexLink>, leftCount: number, rightCount: number): void {
  expect(new Set(links.map(([left, right]) => `${left}:${right}`)).size).toBe(links.length);
  for (const [left, right] of links) {
    expect(Number.isInteger(left) && left >= 0 && left < leftCount).toBe(true);
    expect(Number.isInteger(right) && right >= 0 && right < rightCount).toBe(true);
  }
}

describe("canonical synthetic CRM fixture contract", () => {
  it("preserves the legacy active Pro subscription presentation", () => {
    expect(SYNTHETIC_SUBSCRIPTION).toEqual({
      agentCreditAnchorAt: SYNTHETIC_SEED_TIMELINE.company.createdAt,
      plan: "pro",
      quantity: null,
      status: "active",
    });
  });

  it("pins one credential identity per company member with one shared synthetic password", () => {
    expect(SYNTHETIC_SEED_USER).toEqual({
      email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
      password: SYNTHETIC_SHARED_USER_PASSWORD,
    });
    expect(SYNTHETIC_AUTH_IDENTITY_DEFINITIONS).toMatchObject([
      {
        credentialAccountId: SEED_IDS.maxBergmannCredentialAccount,
        email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
        userId: SEED_IDS.user,
      },
      {
        credentialAccountId: SEED_IDS.sofiaRossiCredentialAccount,
        email: SYNTHETIC_COMPANY_USERS.sofiaRossi.email,
        userId: SEED_IDS.sofiaRossiUser,
      },
      {
        credentialAccountId: SEED_IDS.elenaHoffmannCredentialAccount,
        email: SYNTHETIC_COMPANY_USERS.elenaHoffmann.email,
        userId: SEED_IDS.elenaHoffmannUser,
      },
    ]);
    expect(new Set(SYNTHETIC_AUTH_IDENTITY_DEFINITIONS.map(({ userId }) => userId))).toHaveLength(
      SYNTHETIC_FIXTURE_COUNTS.authUsers,
    );
    expect(
      new Set(SYNTHETIC_AUTH_IDENTITY_DEFINITIONS.map(({ credentialAccountId }) => credentialAccountId)),
    ).toHaveLength(SYNTHETIC_FIXTURE_COUNTS.authAccounts);

    const memberById = new Map(SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map((member) => [member.id, member]));
    for (const identity of SYNTHETIC_AUTH_IDENTITY_DEFINITIONS)
      expect(memberById.get(identity.userId)?.email).toBe(identity.email);
  });

  it("keeps the complete local avatar manifest with square PNG files", () => {
    const avatarUrls = [...new Set([...SYNTHETIC_CONTACT_AVATAR_URLS, ...Object.values(SYNTHETIC_AVATAR_URLS)])];
    const monochromeAvatarUrls = new Set<string>([
      ...SYNTHETIC_CONTACT_AVATAR_URLS,
      SYNTHETIC_AVATAR_URLS.claraNeumann,
      SYNTHETIC_AVATAR_URLS.marcoSilva,
    ]);
    const colorAvatarUrls = avatarUrls.filter((avatarUrl) => !monochromeAvatarUrls.has(avatarUrl));

    expect(SYNTHETIC_CONTACT_AVATAR_URLS).toHaveLength(SYNTHETIC_CONTACT_NAMES.length);
    expect(new Set(SYNTHETIC_CONTACT_AVATAR_URLS).size).toBe(SYNTHETIC_CONTACT_NAMES.length);
    expect(monochromeAvatarUrls.size).toBe(32);
    expect(avatarUrls).toHaveLength(35);
    expect(new Set(colorAvatarUrls)).toEqual(
      new Set([
        SYNTHETIC_AVATAR_URLS.maxBergmann,
        SYNTHETIC_AVATAR_URLS.sofiaRossi,
        SYNTHETIC_AVATAR_URLS.elenaHoffmann,
      ]),
    );

    for (const avatarUrl of avatarUrls) {
      expect(avatarUrl).toMatch(/^https:\/\/customermates\.com\/demo\/avatars\/photos\/[a-z-]+\.png$/);

      const avatarFile = new URL(`../../public${avatarUrl.slice(SYNTHETIC_AVATAR_ORIGIN.length)}`, import.meta.url);
      expect(existsSync(avatarFile), `${avatarUrl} must ship from public`).toBe(true);

      const source = readFileSync(avatarFile);
      expect(source.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(source.subarray(12, 16).toString("ascii")).toBe("IHDR");
      expect(source.readUInt32BE(16)).toBe(source.readUInt32BE(20));
      expect(source.readUInt32BE(16)).toBeGreaterThanOrEqual(256);
    }
  });

  it("pins three company members and three roles with exact custom permissions", () => {
    expect(SYNTHETIC_COMPANY_MEMBER_DEFINITIONS).toMatchObject([
      {
        id: SEED_IDS.user,
        email: "max.bergmann@customermates.com",
        roleId: SEED_IDS.role,
        status: "active",
      },
      {
        id: SEED_IDS.sofiaRossiUser,
        email: "sofia.rossi@customermates.com",
        roleId: SEED_IDS.salesManagerRole,
        status: "active",
      },
      {
        id: SEED_IDS.elenaHoffmannUser,
        email: "elena.hoffmann@customermates.com",
        roleId: SEED_IDS.customerSuccessRole,
        status: "active",
      },
    ]);
    expect(new Set(SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map(({ id }) => id))).toHaveLength(3);
    expect(new Set(SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map(({ email }) => email))).toHaveLength(3);

    expect(SYNTHETIC_ROLE_DEFINITIONS.map(({ name }) => name)).toEqual(["Admin", "Sales Manager", "Customer Success"]);
    expect(SYNTHETIC_ROLE_DEFINITIONS.filter(({ isSystemRole }) => isSystemRole)).toHaveLength(1);
    expect(SYNTHETIC_ROLE_DEFINITIONS[0]).toMatchObject({
      id: SEED_IDS.role,
      permissions: [],
    });
    expect(SYNTHETIC_ROLE_DEFINITIONS[1]?.permissions).toHaveLength(25);
    expect(SYNTHETIC_ROLE_DEFINITIONS[2]?.permissions).toHaveLength(21);
    expect(SYNTHETIC_ROLE_PERMISSION_COUNT).toBe(46);

    const permissions = SYNTHETIC_ROLE_DEFINITIONS.flatMap(({ permissions }) => permissions);
    expect(new Set(permissions.map(({ id }) => id))).toHaveLength(permissions.length);
    expect(new Set(permissions.map(({ roleId, resource, action }) => `${roleId}:${resource}:${action}`))).toHaveLength(
      permissions.length,
    );
    for (const permission of permissions) {
      expect(permission.companyId).toBe(SEED_IDS.company);
      expect(SYNTHETIC_ROLE_DEFINITIONS.some(({ id }) => id === permission.roleId)).toBe(true);
    }
  });

  it("pins the complete visible organization and contact names", () => {
    expect(SYNTHETIC_ORGANIZATION_NAMES).toEqual(
      lines(`
Wavestone
SThree
Hays
Bundesagentur für Arbeit
Deloitte
ASML
KPMG
Deutsche Post
Deutsche Bahn
Continental
PwC
McKinsey & Company
NRW.BANK
Roche
BMW
TUI
Volkswagen
Deutsche Telekom
Siemens
`),
    );
    expect(SYNTHETIC_CONTACT_NAMES.map(([firstName, lastName]) => `${firstName} ${lastName}`)).toEqual(
      lines(`
Leon Becker
Tim Wagner
Lucio Ball
Mara Bauer
Max Schmidt
Sophie Hoffmann
Jonas Weber
Amin Hassan
Lea Bauer
Maxine Zoll
Lina Alvarez
Felix Koch
Omar Khalil
Tim Weber
Kian Rahimi
Leila Chen
Mia Schneider
Laura Fischer
Amir Haddad
Sophie Wagner
Reinhold Mertens
Alexej Sofr
Anna Müller
Yasmin Farouk
Lukas Fischer
Felix Schneider
Rashid Malik
Paul Koch
Nia Johnson
Paul Fischer
`),
    );
  });

  it("uses unique official HTTPS websites and organization-specific reserved email domains", () => {
    expect(SYNTHETIC_ORGANIZATION_DEFINITIONS).toHaveLength(SYNTHETIC_FIXTURE_COUNTS.organizations);
    expect(new Set(SYNTHETIC_ORGANIZATION_DEFINITIONS.map(({ website }) => website))).toHaveLength(
      SYNTHETIC_FIXTURE_COUNTS.organizations,
    );

    for (const { emailDomain, website } of SYNTHETIC_ORGANIZATION_DEFINITIONS) {
      expect(website).toMatch(/^https:\/\/[^/]+$/);
      expect(website).not.toContain(".example");
      expect(emailDomain).toMatch(/\.example$/);
    }

    for (const [contactIndex, organizationIndex] of SYNTHETIC_CONTACT_ORGANIZATION_LINKS) {
      expect(SYNTHETIC_CONTACT_EMAIL_ADDRESSES[contactIndex]).toMatch(
        new RegExp(`@${SYNTHETIC_ORGANIZATION_DEFINITIONS[organizationIndex].emailDomain.replace(".", "\\.")}$`),
      );
    }
  });

  it("pins the complete visible service and deal names", () => {
    expect(SYNTHETIC_SERVICE_NAMES).toEqual(
      lines(`
Data Migration
Network Architecture Design
Rack Server
Custom Integrations
Cloud Readiness Assessment
Data Strategy Definition
CI/CD Pipeline Setup
Docking Station
System Integrations
Backend API Development
Executive Enablement Workshop
SAN Storage Array
Analytics Use Case Development
Frontend Development
Go-Live Support
Performance Testing
Configuration Improvements
Reporting & Dashboards
Infrastructure Migration
Network Interface Card
Installation & Configuration
User Training Session
CRM Setup & Configuration
HR System Audit
Firewall Appliance
Hypercare Support
Process Analysis Workshop
Security Review & Hardening
Automation Development
Post-Migration Support
Device Provisioning & Imaging
Documentation & Knowledge Transfer
Change Management Support
Data Warehouse Implementation
Monitor 27”
Admin Training
Core Network Switch (48-port)
Integration Architecture Design
Platform Architecture Design
Laptop (Business Class)
Hardware Installation & Testing
Extended Hardware Warranty (3y)
Edge Network Switch (24-port)
`),
    );
    expect(SYNTHETIC_DEAL_NAMES).toEqual(
      lines(`
Process Automation Program
Data & Analytics Transformation
CRM Rollout & Sales Enablement
Enterprise Integration Program
Workplace Hardware Rollout
Digital Customer Platform
Data Center Refresh
Cloud Infrastructure Migration
Network Infrastructure Upgrade
HR Systems Optimization
`),
    );
  });

  it("pins the complete visible task, custom-column, and widget names", () => {
    expect(SYNTHETIC_TASK_NAMES).toEqual(
      lines(`
Prepare and send a proposal for Wavestone
Discuss contract renewal
Review inbound lead from website and assign qualification score
Update training materials
Schedule discovery call with BMW
Coordinate demo appointment
Prepare Q3 sales pipeline review
Follow up with legal on contract approval for Roche
Schedule discovery call with PwC
Follow up on cold call
Prepare kickoff workshop
Review proposal response
Finalize quote
Review follow-up notes from the Roche demo
Loop in legal team
`),
    );
    expect(
      SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS.map(
        ({ entityType, label, optionLabels, type }) => `${entityType}:${label}:${type}:${optionLabels.join(",")}`,
      ),
    ).toEqual([
      "contact:Phones:phone:",
      "service:Type:singleSelect:Service,Hardware",
      "organization:Type:singleSelect:Direct customer,Affiliated company",
      "organization:Website:link:",
      "task:Priority:singleSelect:Low,Medium,High",
      "deal:Status:singleSelect:Open,Won,Lost,Abandoned",
      "task:Status:singleSelect:Open,In Progress,Blocked,On Hold,Done,Archived",
      "deal:Project Period:dateRange:",
      "contact:Sales Pipeline:singleSelect:New,Contact,Qualified,In Progress,Won,Lost",
      "service:Pricing model:singleSelect:Fixed,Monthly,Daily",
    ]);
    expect(SYNTHETIC_WIDGET_NAMES).toEqual([
      "Sold Hardware",
      "Deal Value By Organizations",
      "Sales Pipeline",
      "Total Deal Value",
      "Deal Overview",
      "Organizations",
      "Latest Activities",
    ]);
  });

  it("pins the canonical entity and relationship counts", () => {
    expect(SYNTHETIC_FIXTURE_COUNTS).toEqual({
      auditLogs: 161,
      authAccounts: 3,
      authUsers: 3,
      contacts: 30,
      customColumns: 10,
      customFieldValues: 234,
      deals: 10,
      organizations: 19,
      p13n: 10,
      rolePermissions: 46,
      roles: 3,
      services: 43,
      tasks: 15,
      users: 3,
      webhookDeliveries: 14,
      webhooks: 1,
      widgets: 7,
    });
    expect(SYNTHETIC_RELATIONSHIP_COUNTS).toEqual({
      contactOrganizations: 30,
      contactUsers: 30,
      dealContacts: 0,
      dealOrganizations: 10,
      dealUsers: 10,
      organizationUsers: 19,
      serviceDeals: 43,
      serviceUsers: 43,
      taskContacts: 5,
      taskDeals: 4,
      taskOrganizations: 3,
      taskServices: 1,
      taskUsers: 14,
    });
    expect(SYNTHETIC_ORGANIZATION_NAMES).toHaveLength(SYNTHETIC_FIXTURE_COUNTS.organizations);
    expect(SYNTHETIC_CONTACT_NAMES).toHaveLength(SYNTHETIC_FIXTURE_COUNTS.contacts);
    expect(SYNTHETIC_SERVICE_NAMES).toHaveLength(SYNTHETIC_FIXTURE_COUNTS.services);
    expect(SYNTHETIC_DEAL_NAMES).toHaveLength(SYNTHETIC_FIXTURE_COUNTS.deals);
    expect(SYNTHETIC_TASK_NAMES).toHaveLength(SYNTHETIC_FIXTURE_COUNTS.tasks);
    expect(SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS).toHaveLength(SYNTHETIC_FIXTURE_COUNTS.customColumns);
    expect(SYNTHETIC_WIDGET_NAMES).toHaveLength(SYNTHETIC_FIXTURE_COUNTS.widgets);
    const optionIds = Object.values(SYNTHETIC_CUSTOM_OPTION_IDS).flatMap((group) => Object.values(group));
    expect(optionIds).toEqual(Array.from({ length: 26 }, (_, index) => fixtureId("17000000", index + 1)));
    expect(new Set(optionIds)).toHaveLength(26);
  });

  it("pins the canonical relationship topology using safe array indexes", () => {
    expect(linkString(SYNTHETIC_CONTACT_ORGANIZATION_LINKS)).toBe(
      "0:14|1:12|2:0|3:8|4:14|5:8|6:9|7:15|8:9|9:11|10:0|11:9|12:4|13:3|14:1|15:2|16:13|17:3|18:10|19:14|20:18|21:2|22:13|23:5|24:13|25:17|26:6|27:7|28:11|29:8",
    );
    expect(linkString(SYNTHETIC_DEAL_ORGANIZATION_LINKS)).toBe("0:7|1:10|2:13|3:5|4:7|5:14|6:9|7:9|8:0|9:2");
    expect(linkString(SYNTHETIC_SERVICE_DEAL_LINKS)).toBe(
      "0:25:1|0:26:4|0:28:8|0:32:30|1:5:1|1:10:1|1:12:5|1:33:1|2:0:1|2:3:4|2:14:1|2:21:6|2:22:1|3:8:10|3:15:1|3:31:1|3:37:1|4:7:300|4:30:300|4:34:150|4:39:300|5:9:70|5:13:90|5:27:1|5:38:1|6:2:12|6:11:2|6:19:24|6:40:1|6:41:12|7:4:1|7:6:1|7:18:22|7:29:4|8:1:1|8:20:1|8:24:2|8:36:6|8:42:10|9:16:25|9:17:1|9:23:1|9:35:3",
    );
    expect(linkString(SYNTHETIC_TASK_CONTACT_LINKS)).toBe("5:25|9:6|10:22|11:22|12:25");
    expect(linkString(SYNTHETIC_TASK_ORGANIZATION_LINKS)).toBe("1:13|10:14|12:14");
    expect(linkString(SYNTHETIC_TASK_DEAL_LINKS)).toBe("10:2|11:2|12:2|14:7");
    expect(linkString(SYNTHETIC_TASK_SERVICE_LINKS)).toBe("3:35");
    expect(SYNTHETIC_ASSIGNED_TASK_INDEXES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14]);
  });

  it("keeps every relationship index valid, unique, and complete where required", () => {
    expectValidLinks(
      SYNTHETIC_CONTACT_ORGANIZATION_LINKS,
      SYNTHETIC_FIXTURE_COUNTS.contacts,
      SYNTHETIC_FIXTURE_COUNTS.organizations,
    );
    expectValidLinks(
      SYNTHETIC_DEAL_ORGANIZATION_LINKS,
      SYNTHETIC_FIXTURE_COUNTS.deals,
      SYNTHETIC_FIXTURE_COUNTS.organizations,
    );
    expectValidLinks(SYNTHETIC_SERVICE_DEAL_LINKS, SYNTHETIC_FIXTURE_COUNTS.deals, SYNTHETIC_FIXTURE_COUNTS.services);
    expect(SYNTHETIC_SERVICE_DEAL_LINKS.every(([, , quantity]) => Number.isInteger(quantity) && quantity > 0)).toBe(
      true,
    );
    expectValidLinks(SYNTHETIC_TASK_CONTACT_LINKS, SYNTHETIC_FIXTURE_COUNTS.tasks, SYNTHETIC_FIXTURE_COUNTS.contacts);
    expectValidLinks(
      SYNTHETIC_TASK_ORGANIZATION_LINKS,
      SYNTHETIC_FIXTURE_COUNTS.tasks,
      SYNTHETIC_FIXTURE_COUNTS.organizations,
    );
    expectValidLinks(SYNTHETIC_TASK_DEAL_LINKS, SYNTHETIC_FIXTURE_COUNTS.tasks, SYNTHETIC_FIXTURE_COUNTS.deals);
    expectValidLinks(SYNTHETIC_TASK_SERVICE_LINKS, SYNTHETIC_FIXTURE_COUNTS.tasks, SYNTHETIC_FIXTURE_COUNTS.services);

    expect(new Set(SYNTHETIC_CONTACT_ORGANIZATION_LINKS.map(([contactIndex]) => contactIndex)).size).toBe(30);
    expect(new Set(SYNTHETIC_DEAL_ORGANIZATION_LINKS.map(([dealIndex]) => dealIndex)).size).toBe(10);
    expect(new Set(SYNTHETIC_SERVICE_DEAL_LINKS.map(([, serviceIndex]) => serviceIndex)).size).toBe(43);
    expect(new Set(SYNTHETIC_ASSIGNED_TASK_INDEXES).size).toBe(14);
    expect(SYNTHETIC_ASSIGNED_TASK_INDEXES).not.toContain(8);
  });
});
