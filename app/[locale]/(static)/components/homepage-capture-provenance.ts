import type { ContentLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-10-25",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment:
    "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed, small-business demo workspace (kleine-unternehmen for German)",
  productRef: "706c24adc",
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
        dark: "f2ded09fbef051865c2a741f8e366e3beacf3afd3f3c26775656767dd54fffa2",
        light: "0b63b351897378d360fb172f21b1ec42116dfea9bf5d69bfe2995d81cb4c028d",
      },
      en: {
        dark: "f189230a03393ec2f2917138cae01ac90c93657b13113643ef2602e52ba0f415",
        light: "74ee1c6b08bd1281ea476470269b76980e93e50c0303bc725509065143beb2b7",
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
        dark: "15b2b76eeecf29400128182f8978850d7e86338f8b06d1724e9c678e52edf331",
        light: "3511fec373d1ea6a4b4df9070d328f253f54301d417d71426be7f56d15ba58ac",
      },
      en: {
        dark: "b6c7da610928effba7b5ff9f43da41a11a937e7c0926f28950006e311df64ed7",
        light: "383ae69f3e35a175a122002d2ed4c28403a8753ab429104f15052ef0e37a906f",
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
        dark: "71473a107c40bd7358f18a9d4aa712b7a7909d1c2bdd3d6c7efa3cdcdfacf1a9",
        light: "5d55f28e6dcf3a90daa38faf0c18ecaf39673ba4ca733cdd2d053a2814a93dca",
      },
      en: {
        dark: "25dca4d2332888275e0d784920b055fa147b473018391b8fc3dc0ebc65177076",
        light: "b188c2e8d14736598539e36cb0041a004fc4f777fda835672d9c30c41a80b8e8",
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
        dark: "b2381dace1987871e388edc1bbc2d90e0e06c0c3043f4ae495dd51f020b84873",
        light: "773285404a4beae295e2da6261b848ff8c6f54b23ee75c3e1f9f0ebab94ea765",
      },
      en: {
        dark: "5c94b56388fd7feea6e0cf6325b10f5c12a363f4fca731302878c8f66de7270d",
        light: "6b5ca01e22bdf8a9e96a9edae7ca0c7e6693d03679959a3c0f33899d0e72299f",
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
        dark: "411a24dedc414c7d4be57693aa4366ab786ecd6d48a68afd74e55acce52ee384",
        light: "adc49358848c4b13976cdf6ac183614e93ca30e30edb2306f25b1413c6c717dc",
      },
      en: {
        dark: "3f0aaff977a156cb167076048aaff9466ca165a1f6f376871c45d85c6aa80cdf",
        light: "136387e18469f776e027aa69c682e62da99ada785a854e56ee6db20dbd8b7c19",
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
