import type { ContentLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-10-25",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment:
    "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed, small-business demo workspace (kleine-unternehmen for German)",
  productRef: "5f0c81da5",
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
    route: "/[locale]/w/[workspace]/inbox",
    scenario: "WhatsApp thread with Sophie Turner (Sophie Thiele in German) selected in the unified inbox",
    sha256: {
      de: {
        dark: "19badc9e49a34574f85bc647df12c0137cd3bd7c5a88b4e0c9319756868fc5d6",
        light: "0d4aea4e4e2249574305d8ca961daabaefc18251db6a703fae69af59ccc1d667",
      },
      en: {
        dark: "74566f72affa2b1898cbea476712b68486445d0405ee8e43af212cfb38d60796",
        light: "8190e1957b9102931126936caf73fb460ccc1ccb02e16f857083f7183e4977a2",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-record": {
    clipped: false,
    route: "/[locale]/w/[workspace]/records/[contacts]/[id]",
    scenario: "Contact record of James Finch (Jakob Fink in German) with fields, channels and cross-channel history",
    sha256: {
      de: {
        dark: "1fe8edfd0e792d86216c3174724f9889048fdfd4040956e8435604e0f854201b",
        light: "a47e2dd369f990d3470b62bdeca6dd6a30a9ad2d6d895630d05f9c493ad1042e",
      },
      en: {
        dark: "bc2afefbf3f0ee03829eaab29708d1ee8cef0c30428b118ef7e550a5beaeba22",
        light: "db1f5e90f0c65803c5d11abb2a452ccf642aed993e56b26b4529f58926a820a9",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-pipeline": {
    clipped: false,
    route: "/[locale]/w/[workspace]/records/[deals]",
    scenario: "Deals list in the Pipeline board view grouped by stage",
    sha256: {
      de: {
        dark: "b6002f4ce8bee36e535460d350b52705ea35c514d3595e687b42c586de42be2e",
        light: "05dee19c4c6e18b420e37e4113ed99747cc4682126040fbca7880c1494b076c5",
      },
      en: {
        dark: "82a47fe61e8e35b7224086f1dd20a93b645e173d6ee229b370053def3a7c2e2c",
        light: "06b39874bad56e758b1dd8b6013db3d4e88f5140fd687818044f74137f5cd13d",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-dashboard": {
    clipped: false,
    route: "/[locale]/w/[workspace]/dashboard",
    scenario:
      "Main dashboard with open pipeline, value won in 12 months, average won deal, overdue tasks, pipeline by stage and won value by source",
    sha256: {
      de: {
        dark: "e3cbe521986cce77cfe0b13445b7fd1ea8299b111fd4443de1d158f1fda2d6e6",
        light: "100e80f1bfc3296a32376747991b8baebd37ee5b589c890ed33a69bcd36a0571",
      },
      en: {
        dark: "c442fe689e496a5a31f45f8569e21e011703660afecb2d094bd5d44ebf137f03",
        light: "de3790b2ff4af9efa4a874da12a7d45119073aec214e3ad9169a8d84dcdfa132",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-routines": {
    clipped: false,
    route: "/[locale]/w/[workspace]/routines",
    scenario:
      "Routines list with owners, schedules, triggers and last runs of the small-business workspace (kleine-unternehmen in German)",
    sha256: {
      de: {
        dark: "898cbe61ec53287d6f9e8435d49fd9818ae6f8f4229209a4c82975746a82dbdb",
        light: "3453218c3a64caf44e8989eef1c2360b2217c3810c87e91392d79005cf3f3dc1",
      },
      en: {
        dark: "ae617fe038c94a9fe0323e57f12e0ff274db35a32f4281dcd5457607fd0a1c69",
        light: "2e6c91a43201e80180e951536922e81dbc702589b1101eb082fbcd3b2c90bb7b",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-configure": {
    clipped: false,
    route: "/[locale]/w/[workspace]/configure",
    scenario: "Data model graph zoomed to the Deals list and its line items with calculated fields",
    sha256: {
      de: {
        dark: "bcee982edbb5b438848040c5d05ea15b9103525d6acd77a54578c5ac57373d9b",
        light: "f0e5ad35eb4c31dd99c45c7f32160074671de907d2944a15b12ec009a0e119c7",
      },
      en: {
        dark: "0bc495248f09896b623afeb55f2947e21029e69992d1f03bcc65738dad3088cb",
        light: "3c3b446983e1d3172a5b195ce5947c0071a6e3e6677962c12cb019cb4436a9d2",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-thread-linkedin": {
    clipped: false,
    route: "/[locale]/w/[workspace]/inbox",
    scenario:
      "LinkedIn conversation with Ethan Clarke (Erik Claasen in German) beside the thread list, sidebar collapsed, at a 1024 px window",
    sha256: {
      de: {
        dark: "a3005ee966b1c600251ee1577015543fdc29304033e30b8ca1f833a7dba617b9",
        light: "2d8a1392ab662ca920f37dce84161c7a96e8c1efec80db7cf086c1da2c50993b",
      },
      en: {
        dark: "0a60f3c629762599b16b629c6092317622df09db52267f4414a8691282596c8f",
        light: "f3d9667da33d3b9b37c0bdba27f25da183a85b75bdf09934458ae378e95b78d8",
      },
    },
    viewport: { height: 900, width: 1024 },
  },
  "homepage-draft": {
    clipped: true,
    route: "/[locale]/w/[workspace]/inbox",
    scenario: "Email thread with James Finch (Jakob Fink in German) ending in a saved reply draft with Send draft",
    sha256: {
      de: {
        dark: "95064d772870341c7676f13ff100558a64f9c2c43ebb3eae228543db2162e2c5",
        light: "c81767198358d730b0dc150e759c1d545d4bd11fbaa9272af65cb9d9f8a81d72",
      },
      en: {
        dark: "04f9af4731cb2ab7b7fe38782fdb4f4cdfcac16c9cada786f0b4e3dec1249ce6",
        light: "fd9cbb35a058003d7570c79f1de0c224e7c32f3a8a87eebad7d6567fbc703e5d",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-inbox-mobile": {
    clipped: false,
    route: "/[locale]/w/[workspace]/inbox",
    scenario: "WhatsApp thread with Sophie Turner (Sophie Thiele in German) on a phone-width viewport",
    sha256: {
      de: {
        dark: "edd1f3ec8f486815f607dea80092c0bde340a3042531a692e22a1ce8fa59184a",
        light: "9138692b18274ce8f60afb836aa106fe96caa3b537f58bb03a81b37b5dcce843",
      },
      en: {
        dark: "b1cd82f347a494c9eca4a9afcd7b332f8a81442a62bdce2f38a2be89c6b15ce4",
        light: "affe8aee2d29963f3b516ea0ebdd74a990959b2a2310b3d8637cd7645dbffe55",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-record-mobile": {
    clipped: false,
    route: "/[locale]/w/[workspace]/records/[contacts]/[id]",
    scenario: "Contact record of James Finch (Jakob Fink in German) on a phone-width viewport",
    sha256: {
      de: {
        dark: "d3cb8939672ca0ccf909a962844b582a83ead7ac88472c52a5becd69f081f634",
        light: "00b764d6c1d81c73502e317198ee7a740628fc75e32a626359bd67b5c86a9cb5",
      },
      en: {
        dark: "43efa593e30ac32d2bd3d19d1fe3d989abdc02e562b76dab2259507a4e9334f9",
        light: "4618b32652b679ebec13139bdd0134ea11d4586faa916630e1ffc7da5613f4bd",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-pipeline-mobile": {
    clipped: false,
    route: "/[locale]/w/[workspace]/records/[deals]",
    scenario: "Deals board on a phone-width viewport",
    sha256: {
      de: {
        dark: "d79c99a86c43c7083693354b48ac17a980101847c92d7b7dc39fe58cdc0ada66",
        light: "0872df99f123874a2ffbbad0bf4603ccbec34a37edd51a2dcebd6ac94624a49b",
      },
      en: {
        dark: "330db36e4200a6735803861524fae549f02e718116cc08f940c2890ac7fb7814",
        light: "34731d585bb8cee0c8fc4b11b3248fb57afdeb159d38271d6c2bf0fb582ad804",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-dashboard-mobile": {
    clipped: false,
    route: "/[locale]/w/[workspace]/dashboard",
    scenario: "Dashboard widgets on a phone-width viewport",
    sha256: {
      de: {
        dark: "a8793857facc3e0fbea43ed4701660ffcfa5e35fa8d9a7fa3aece43088f2d630",
        light: "cf55861c1fea2dab8ce5b57ca4cf920926ea6c93588c9d2d1883b25a4ca0cbea",
      },
      en: {
        dark: "e2fe5681271926fd002c685fad7328f06a1c00d07bd35366556e32a0f16ef387",
        light: "2e3f0deb081275e39a20a8b8b1ddc42c1591f4a91f956f827f2a70e7bfcb10cc",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-routines-mobile": {
    clipped: false,
    route: "/[locale]/w/[workspace]/routines",
    scenario: "Routines list of the small-business workspace on a phone-width viewport",
    sha256: {
      de: {
        dark: "6f2a0a8b54bd71e171efac0ec12074cc577587e3b4ac420797a7c9c270492a6c",
        light: "c52ff00152fc8c7c3adb85a19b298f823bdb6e8487ba324a7c671a04aa1ce90d",
      },
      en: {
        dark: "6cf031c83557cd5b8c95884288e495e0408430cc3f1578a73f80911f3aa74046",
        light: "1960dee5daec2170999e0fc49c483aa89746dca1773775f95938056321fa1c0d",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-configure-mobile": {
    clipped: false,
    route: "/[locale]/w/[workspace]/configure",
    scenario: "Data model graph zoomed to the Deals list on a phone-width viewport",
    sha256: {
      de: {
        dark: "0b48c806053e74020bf9faba92bb8898fc3d245105fdfb3067684c68ddba8a6d",
        light: "4338bc71584619f36f79fb11a329f997c8db633f18bdc087b703e8ca93389b1d",
      },
      en: {
        dark: "e75ee5482c27f3490127439a47d6f01c516e0e15bdf96bddc65473363e0dc9e1",
        light: "79ac17d9c5a8651630682e6f3be2b250c2972e6f13544c8e9d957c3c15514440",
      },
    },
    viewport: { height: 844, width: 390 },
  },
};
