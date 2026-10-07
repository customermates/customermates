import type { ContentLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-10-07",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment: "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed",
  productRef: "89f336f19",
  renderer:
    "Chromium via Playwright in the page locale, Europe/Berlin, device scale factor 2, theme set through next-themes",
} as const;

type CaptureEvidence = {
  clipped: boolean;
  route: string;
  scenario: string;
  sha256: Record<ContentLocale, { dark: string; light: string }>;
  viewport: { height: number; width: number };
};

export const HOMEPAGE_CAPTURE_EVIDENCE: Record<HomepageCaptureName, CaptureEvidence> = {
  "homepage-inbox": {
    clipped: false,
    route: "/[locale]/inbox",
    scenario: "WhatsApp thread with Sophie Wagner selected in the unified inbox",
    sha256: {
      de: {
        dark: "8ca0b7fa0d6ab4dbf7790a7d67d54570cd5f782a1650d629fd9bf26d5ebe07ec",
        light: "c26a672eb1f3a3927037e9036346f6fc5dede7a4569138cb4759affe1e606259",
      },
      en: {
        dark: "828e03da5df8164fe5dfdf79db0ac2fcc919b66844d5038b4f66c6344d74be97",
        light: "436ee1a288c58f4c2ec69de324557950006d9cb155e8b35e65ec3180f02dc1e5",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-record": {
    clipped: false,
    route: "/[locale]/contacts/[id]",
    scenario: "Contact record of Anna Müller with fields and cross-channel history",
    sha256: {
      de: {
        dark: "538aca5f48764413ed3b1d97ffb29d4f750e6ee8bbba9c708a56c8b9356a0ec8",
        light: "6cbf090096d3f8b39b3717e3102ee86be17a08f6c2231d55377bc6417dbe5d49",
      },
      en: {
        dark: "328746d01ae2e72e8215ef1d76b31b61acf0e38f3c9b1cd3afcaadafe012f18e",
        light: "337569a18ec4ec93b3c66d2c8ad3014c5c39a8f66e3b8b2bbae3537d8d99bc53",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-pipeline": {
    clipped: false,
    route: "/[locale]/deals",
    scenario: "Deals in the Kanban view grouped by status",
    sha256: {
      de: {
        dark: "1902610c98fc53a2e5921d495c666c960a0cef3ee6153414057723949997cb82",
        light: "0cc18e14147ee17dda5a93be98af182a7e6c7930e00ff10d3a8736958d0cbddf",
      },
      en: {
        dark: "c10940d1b5aee830ae40ea9a6bb1206ed9ca3933be0a1e0f6bd799074c3d8230",
        light: "69e2087b742a074eb1f42b96b07a6a5d91c0d03d08444eb08144526538c95525",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-dashboard": {
    clipped: false,
    route: "/[locale]/dashboard",
    scenario: "Dashboard widgets for deal value, pipeline, recent changes, messages and events",
    sha256: {
      de: {
        dark: "5f81322a82f7457094e847369fbcd55cb9dfe2585c1b0af4bf2ea7af7f3bdfdf",
        light: "6b11155056883d85b681012c62c08a5eed65326626bbb3b7bd255b09a58f61a4",
      },
      en: {
        dark: "54257b994b8ec6fca7bd7dd2b95ee7b93b4fc24c5b64739a973b955fd5441c2a",
        light: "765fd8183a35e60edb2be0e27fb86ccebca2842946459e9791fa84b004ad247e",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-routines": {
    clipped: false,
    route: "/[locale]/routines",
    scenario: "Routines list grouped by owner with schedules, triggers and last runs",
    sha256: {
      de: {
        dark: "03b4dd2d0633ad7aa3a6594bb8fdaa0a508f837ae33f94dbccc0617bc393d077",
        light: "95e371edde62b22394af3b3549393c7b47e6fe597ed1e61bedaae72e26fd41bc",
      },
      en: {
        dark: "20ffafee8127d6240d13a44f10653c2d5b40a60a08d765a6dba1166fa38edb09",
        light: "8cc4f8292e35b54a44244cfd9cdfb16621468d4bbab9f1d51c94602940340f1b",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-thread-linkedin": {
    clipped: true,
    route: "/[locale]/inbox",
    scenario: "LinkedIn conversation with Leon Becker, conversation pane only",
    sha256: {
      de: {
        dark: "e8b1dc2a77fd34ea397ac1d78250102ab28ab0b3f47f76cd842bf93872fc819e",
        light: "7d2856d0630caee79a913bd18cb87b554b50df13918e077ef35c6666d8ec2fad",
      },
      en: {
        dark: "c6bbcff2f1e01b40bbd0741a72ee84483fd4cf7a720921bb0d2aadc1b8d1f867",
        light: "e960ec517a58b95d5bd0267d61d1634ed1d3e467031125be1de28ac666886e14",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-draft": {
    clipped: true,
    route: "/[locale]/inbox",
    scenario: "Email thread with Anna Müller ending in a saved reply draft with Send draft",
    sha256: {
      de: {
        dark: "5dab5b348241d95b158ebb79523445c1c2862bd712e20e282947bd07fa87ed39",
        light: "0be0ed452ee74d0566a613ce964f541c5b543cad7936ff745cea8b86ed5d24b9",
      },
      en: {
        dark: "54ab92f94462565a446bb30fc0289e335d976eb609d22d771e03741bf1eab62b",
        light: "28f0545914b57244380a2548364b36fee81699128deb31e53e7e939c38664a0f",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-inbox-mobile": {
    clipped: false,
    route: "/[locale]/inbox",
    scenario: "WhatsApp thread with Sophie Wagner on a phone-width viewport",
    sha256: {
      de: {
        dark: "7d662de42a79d8223d2767aaf4c455422da93071804a76e6585e3440da3aa6b0",
        light: "66edcc3f3c1ab16c96f641668d43bac580dc4a845c193b4c8dc48564cc6f01e5",
      },
      en: {
        dark: "40506804fba65236261e5b88f277446d8b32c79c5b115ea865e0baa830475faf",
        light: "c8af9ade091813961818b426fef7002bdc02ad969fc59a90210584aaacca5aec",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-record-mobile": {
    clipped: false,
    route: "/[locale]/contacts/[id]",
    scenario: "Contact record of Anna Müller on a phone-width viewport",
    sha256: {
      de: {
        dark: "d15d1e1aa3f3f888ab4bba83b80d1a5ff92aeae3a12fe9102d0b38fcbe4a1e6b",
        light: "a1aa2792f24e76aa5be30a8e4624822af4aa3bfe49e7a5d1f6df40269e494b5f",
      },
      en: {
        dark: "e5bd636ef109a9c4512f320ce03ec333c3a5be6bb2f6ad9e2ddeefd52b091fc0",
        light: "cddebb3ae4f8b2db7335b9f108cf3db6be83ba804ce134eb7431f0fb767e0e9c",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-pipeline-mobile": {
    clipped: false,
    route: "/[locale]/deals",
    scenario: "Deals Kanban on a phone-width viewport",
    sha256: {
      de: {
        dark: "f0b589a5f8da9726972cf7012684070f98e249d568d984b06401d60d24fd6a4b",
        light: "187eab125420135011d4011107299d1539350c671b9858ba65db2d077ac3e698",
      },
      en: {
        dark: "b81c5cefe4c39b9c00a0596215427023c89bfd5a5445a02a51341bf3ee51b956",
        light: "270f6f07a290b105263e1666418cc747955130f25eba221657ca2fa1e90d991a",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-dashboard-mobile": {
    clipped: false,
    route: "/[locale]/dashboard",
    scenario: "Dashboard widgets on a phone-width viewport",
    sha256: {
      de: {
        dark: "28b453d6ed1d9651a711957a86c82b8b07c35ac2ea950fdcfe52e7743fcc57fd",
        light: "6cc41e2d8e033cf6c3186051c1ff60e4fae2453055ed08c3aa7d415a166ca46e",
      },
      en: {
        dark: "0cf569b35f2ce7a42907895302a7778f9353b2fb7268340355c00e80fd1c3871",
        light: "ad8529d18ac1ec9e293ff45d2ea0402362e3749c755b2b686fd8d07611fba807",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-routines-mobile": {
    clipped: false,
    route: "/[locale]/routines",
    scenario: "Routines list on a phone-width viewport",
    sha256: {
      de: {
        dark: "2c77a031c91846dc68e9c80051e72cdbaf75da8b5103478da515da160d6e255e",
        light: "f58471175175d4f244c52a7d45a97500a4474036141e68e4cb0733d1dbd1dc50",
      },
      en: {
        dark: "c82dd833a8b147a9d482d3bdb8f2935efcd2a05731afc8651d68914dfd1ef320",
        light: "75d4e688f7597c26ceecd10dd6e75b91492f5951dbec833f03a2390e64e7e04a",
      },
    },
    viewport: { height: 844, width: 390 },
  },
};
