import type { ContentLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-10-14",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment: "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed",
  productRef: "1f30b0030",
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
        dark: "17243295bb4dff72c7c9ac746817f06084d0f58bc706d91326ebbadfe4669aa3",
        light: "52bfdeeceae8b12ea8d6479b32302268d2ae4ef14d45924404047c3de512d3d6",
      },
      en: {
        dark: "05f7e0d062040cb38e425b4f31aa42716ce22b5c54208d1a706b21f2cd0fe197",
        light: "983d232b9d828682dd10fc3a4a78fecb0a0b16fbf27ed1c9f78f699ae301fefd",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-record": {
    clipped: false,
    route: "/[locale]/records/[contacts]/[id]",
    scenario: "Contact record of Anna Müller with fields and cross-channel history",
    sha256: {
      de: {
        dark: "32f427009558d6376471cd43d56a5ed3a5e13647cf50fbaaccb1c8eeb7fb69f0",
        light: "78c48430949947806a0792d326dbb88f4333affec2795519fe0f165345211df8",
      },
      en: {
        dark: "0e92e7e97790ccb7bb6fbf268cbd9f9ea2f8743fdc336073c358d1cc017560e3",
        light: "c32f8bfe1d122db140c9973067528aca2f925c88e0a3131a70d540eba2141471",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-pipeline": {
    clipped: false,
    route: "/[locale]/records/[deals]",
    scenario: "Deals list in the board view grouped by stage",
    sha256: {
      de: {
        dark: "fd53799dcd41300de95cd5357c1910c0db95df066c2648ffa49a9057aaa7ea71",
        light: "2beb378ef15a6f5930bb41717cba914ac87977db35a0d81b776c694501a70159",
      },
      en: {
        dark: "643b01bd7ab7c3f64e02f8bf232002713013791db0a4ed2bb5d1d5d8fd235ae7",
        light: "7d4acc4ae356e3ffad9c8da82dfef74c5ecb86da150dff4e6463bce3e3a72487",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-dashboard": {
    clipped: false,
    route: "/[locale]/dashboard",
    scenario: "Main dashboard with open pipeline, forecast, won revenue and revenue per rep",
    sha256: {
      de: {
        dark: "1ff319644167447f0f10a9de7faab56278304f86b445d5b74395289d16459711",
        light: "e1e54b8eb11cfbaa6effdf7156daca3a6485549b9d7138eb66e166722ec89db1",
      },
      en: {
        dark: "7bbf8182523d358c18fd6ee388cbee0fb40c74f4c739a0b6d9f64db78df73b24",
        light: "ed47d6dd0199ef63b7fbd56de89a0211525da41400b01793725f82d3fe0c2c24",
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
        dark: "e9861d92a50b630c2bcebf3d4e79ab9db2141929730115807c09002271f88deb",
        light: "8e53207ffb2b646ebb68ec33d3aabb7307be444ae637694cebeb3dec94d5cbc1",
      },
      en: {
        dark: "af889fd6569de9bad0e2dab7b2d65dbe6994ee12e7654c0a3ed8a89b09a322ab",
        light: "09b016673f2476fb650dd8b9ad62df4d5c067b7336a76acc17bf9dd27a52e6dd",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-configure": {
    clipped: false,
    route: "/[locale]/configure",
    scenario: "Data model graph zoomed to the Deals list and its line items with calculated fields",
    sha256: {
      de: {
        dark: "1166317c95eaddb60188ece46eeb7739f12172402bbac42154e2f3844c8250be",
        light: "046ee7ff65fa662a260eedd0572547b1801d460062bbde157c20262f52072db2",
      },
      en: {
        dark: "8f77970ed928fb1b8f01f13836de4bcb525fd2c64d918247da0d6648ffcb7305",
        light: "e09bc558f00e787dec7f05427e52e4562bb071fc9c0649ebbbe3af344a84aa51",
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
        dark: "16596bcb45b1e92e4baca059a66ec00ef892b58848a311efcc9764cf655d2eeb",
        light: "0a30917da73376f795254391668b96b7425f298e0c07533e85f1715adbdef4d4",
      },
      en: {
        dark: "acf857e020ed7398595ba4908cc8afb799597ba1ef21dd1dcd491ad8484a1705",
        light: "670379107996ec2fe54060cfa0f3e4d6fae36fd2df875b173b4b68413fb4e4ab",
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
        dark: "8d3fc6c8eb4f4e2bc33f60f36e8b46d60e7c466a8b573e281d5b47c3a76c3455",
        light: "d0f97c500fd383d1ba9836b49d5c6ec71a46aae57aa437b9ce6dd9b69ec17dce",
      },
      en: {
        dark: "cc75db6db2861b4061f04df5f193a77eb103b44d36f1709caa42079845ea1fe0",
        light: "ab488f6b4d09288bea426806bccf19a028813d13ddea8b279ae98e9ef2e5f8c2",
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
        dark: "36b0087a08d0c460c3aa1872e269820ac64316a429e10976b05c73892975a0a6",
        light: "2bb78e7bda4ed1d69af3427212e79758d53a2b79c08d31f4f81c2b30c3725c25",
      },
      en: {
        dark: "9034371479e1fdca3104fc0c3dcb690112b23356eecc20218bbf0c58d54bb17a",
        light: "69bd8beeecdeed5b8c9f14ab80443e4a9b7da172b41686e73e22def1776e69a5",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-record-mobile": {
    clipped: false,
    route: "/[locale]/records/[contacts]/[id]",
    scenario: "Contact record of Anna Müller on a phone-width viewport",
    sha256: {
      de: {
        dark: "8338fbbd7d35cc3b350096ac0c2cb0df2f333f52fac830fdcf122c7cdc5a7676",
        light: "20b1feb58a1839933c2881ec1997642686acacdc4137671b10640e956f54c93a",
      },
      en: {
        dark: "6f2c4087788e5a0ce3ec3126d2e8004ff41ba4b49bfb9cb83e7bd8ca683e5236",
        light: "57b71dfe9051e8c20931016e6200e3c299fd0e0ae32038ac02b6314b4e71e52b",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-pipeline-mobile": {
    clipped: false,
    route: "/[locale]/records/[deals]",
    scenario: "Deals board on a phone-width viewport",
    sha256: {
      de: {
        dark: "c7f2b58278f764dac2e15dc0cc18b8da35321a7ef597682bd4b0d46b02fe816d",
        light: "d1b75e87877b57ddfe80335d0e7bbf12611881a2608c14785cee9bc6ad81eca9",
      },
      en: {
        dark: "896cbb9522157ed1c2642ba12f14407725a6ed35a7253ccca337f403cf89ec31",
        light: "fdb5373d7c2b19fb481066830fbe2c12f7675479c7792e16679877c873f31123",
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
        dark: "1e6d76cac106a0afb909682dea1ab5059f235f4ff0cea5331af6054a59e7d3a9",
        light: "f745c06402653e1d9c1587b029637375350a76ce05437f31578df950a864997a",
      },
      en: {
        dark: "d5e5816afd6d01533f25cc0d460d1c624cef49acfcc4c409b93fd9528188df48",
        light: "a9dca45daca75023a81d329827e0a7e34d9964034c1e28508235ec3502797c2b",
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
        dark: "f55db6f658f121ef73e9b2b7f98b2ee092538175adae423a2db8c8ae9098338e",
        light: "3d9404b863ec9cd759598030faa7472cea26629fafb90fddf9320b7e8fee054c",
      },
      en: {
        dark: "665a3e7226b3ec1a97ee702c448cfead8ae893083af875a2080f3078866c57fd",
        light: "c9cae1d7ecea8ee4b2d9be5b54523719493936336f86557af17ce78d3e3e436e",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-configure-mobile": {
    clipped: false,
    route: "/[locale]/configure",
    scenario: "Data model graph zoomed to the Deals list on a phone-width viewport",
    sha256: {
      de: {
        dark: "fff190c2e18f76a5f3af3c9bac3073e7c96c66a9cb76ce94a23850e368d2eb59",
        light: "f3765834061d3697cef2317decbf4087dcc40c4e23cf3aa41705f4e691bfc941",
      },
      en: {
        dark: "94368b5dcd9fd9a417f8bf968c36089b2e024cfd84a1f8abf0135610c85b2d7f",
        light: "a6ae0ab7d9ea37e2d14d9a04bb134c8fd47888eec61828174cd53972884bce58",
      },
    },
    viewport: { height: 844, width: 390 },
  },
};
