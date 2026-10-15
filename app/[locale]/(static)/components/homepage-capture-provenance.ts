import type { ContentLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-10-15",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment: "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed",
  productRef: "8510bf681",
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
        dark: "4c059c28a3d0c4019340dee0104e0df031614eb058e01c0cbfad25adb089089d",
        light: "c2ad057e84656d2633469a645cffb647b1d1e7a1e632497275a3b39b6b2e7dfd",
      },
      en: {
        dark: "0e6553b88de288ddfa576bc57a13de5c0854234000b6c1395bc305984113ae02",
        light: "10dab0ba7074ac38fa6e75d75a93f0863246c153b43d2f679063ebdb62d76314",
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
        dark: "a59198b19536b15aed20d17aa7f71d0c1c5d44ebe0448c51210ccefaa3881bba",
        light: "970e17020ca4a0259f50051e6968f401432ad7bffe3bedee45113cb090e41666",
      },
      en: {
        dark: "08ea998cfcac91e6ca1eb6df548cdf7f508c9be46b900c44ca33c32baacdb507",
        light: "7ca41a91a5115aadc5154a734235d2e5c70ef28207edcd7c31c44a5471896f0c",
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
        dark: "688824b5046d4479000882e6b3dc2d727449bb2f6750b882b519cae37512de3e",
        light: "1cdf1ecfc5363de15a48cadc09b3d64cd9a49f1fbf80329517710cd7856d15c3",
      },
      en: {
        dark: "ac13e21488be931e321fd6dbfe74e34237947f9b2075b83d15b50fd88a551ba0",
        light: "a96b1a94b4c8f212f407be2457e4bdb9b52b9577cb135d86f420bdf1d504240a",
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
        dark: "714d40429bd6fc0dbf90e2f86567dae6e73b62fb1acae8dd4c2be2d1df67d280",
        light: "40eb06b4a55879afa92dda77d43e8b0958a37dd72ce9bdc1eb99535c56973ec0",
      },
      en: {
        dark: "f55a21ae4c7614e579f87a0966b52227d19a202d86561c79b2861a0f90f1a6b1",
        light: "a82a059255aeffba112599d38ff1f0e409aa8881170d49c2e2517ad991760316",
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
        dark: "c7882d5a75dc9202cfff7aa7694428d8a5682cd4115cd42c43e48ec953062628",
        light: "66c80ef69aae99c2922a6d5a198efd531f2dac7f915cea445e7425eac7374d16",
      },
      en: {
        dark: "66ee2c1558e1cb6b7cbb4ee7aeed781fae08efdc6d893249e63ec99f70cacddc",
        light: "267db9ca88b5d38ae20d725c1ac04462b1b3b179789ab5a2adc26ecc99655a72",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-thread-linkedin": {
    clipped: false,
    route: "/[locale]/inbox",
    scenario: "LinkedIn conversation with Leon Becker beside the thread list, sidebar collapsed, at a 1024 px window",
    sha256: {
      de: {
        dark: "5888102c5bdc5c893a6d9bedfeb80e19a7127ba1bfdd99995561e69d702440a3",
        light: "d29742a5f0a497cb8312392ada6d8d92b7665a0e79b2a43a3d3c24ccd9454fd3",
      },
      en: {
        dark: "aca613ba9fd796d1db8d4266142a09293fcb1e49acaf03d68ed8b88c80b36425",
        light: "dbb9f6374603bfa2ae7cfa1b988338db60844cf81cb9cfaeca81e32bdfeab458",
      },
    },
    viewport: { height: 900, width: 1024 },
  },
  "homepage-draft": {
    clipped: true,
    route: "/[locale]/inbox",
    scenario: "Email thread with Anna Müller ending in a saved reply draft with Send draft",
    sha256: {
      de: {
        dark: "d5bf3e7627c3a99bffd337ff6657ad3bd4056a3b50c8666505dbf93e07f4675a",
        light: "d7bd9a615cc46297188151c93e919f25d63807827d9353733061c1647443e1f0",
      },
      en: {
        dark: "8ec8184eb556eb1b5ea433f8e8fc971b83ae83edd6b9b4f56408621dadf402f9",
        light: "01833bf3a0efa0ddf17376d774e86a43082f38d64ee5a0660550e00d321330d4",
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
        dark: "56c7add36b57c75b96f1efb3fc0e9449acbfd653f54e61f21fc199e2362c4e0a",
        light: "21e253fe14ebd952d243a4df36494eff63f70fe32f5759535d28b636a2752a22",
      },
      en: {
        dark: "e8b7884975add94d4f0555b2bd64e91541762faaf2b538e0dc6b46da4b1c953b",
        light: "8d6d135216de5856299d93e9420d80ed95428a3914f5d14afd66e2ca9cbeecba",
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
        dark: "cfb011c369dac90192efa61d7286502ae97d8145640f2a969e03a84f3dd3dddf",
        light: "0ad71594b9dde43e7e166bc12bbc082f7abc67c39df22c6ecba79afdee8711ec",
      },
      en: {
        dark: "cfa0e9df780219da447c2319089accb4bf17ca78a85b4aa0f17b33c17f68c7a8",
        light: "17a04631e9a670811c73298a7fba178d66a6ba59bbee84fd87397fd4acfbb271",
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
