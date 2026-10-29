import type { AssetLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-10-28",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment:
    "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed, small-business demo workspace (kleine-unternehmen for German)",
  productRef: "550c91ad6",
  renderer:
    "Chromium via Playwright (scripts/capture-homepage.ts) in the page locale and the workspace time zone, device scale factor 2 or 2.5, theme set through next-themes",
} as const;

type CaptureEvidence = {
  clipped: boolean;
  route: string;
  scenario: string;
  sha256: Record<AssetLocale, { dark: string; light: string }>;
  viewport: { height: number; width: number };
};

export const HOMEPAGE_CAPTURE_EVIDENCE: Record<HomepageCaptureName, CaptureEvidence> = {
  "homepage-inbox": {
    clipped: false,
    route: "/[locale]/w/[workspace]/inbox",
    scenario: "WhatsApp thread with Sophie Turner (Sophie Thiele in German) selected in the unified inbox",
    sha256: {
      de: {
        dark: "0d31ecbe152f80b081c084b50bad4dea97fde9efca94e2161c365a3a6ca788a7",
        light: "46acbe75a9849da7f883bc486732fdc8ee8603b21ba2d72ebffc7907eeba5692",
      },
      en: {
        dark: "ea8274f46d4c05f5a8b78adeab98d9e73f1bea07e4f1d475ae75c560a4405cfd",
        light: "b82525a61b3c7073ab2195fd04904524393184f07c8f539eaef63241eee8a838",
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
        dark: "c92ea5d6b72c3724b8e5e58f8636f2c0363df1a77ef4c565000fda035da3c946",
        light: "9c4030b3cef2b0dfacb0fbe7649d524b15b4e4895a7a0743ff8432849b9daaba",
      },
      en: {
        dark: "7c1f1580401119d99a051b0ba9cc67f166c5a9a77eafec264de6ff67198f2b3b",
        light: "8c8aaa0bd7b291ddfb6ccae5ffd15591b5f754957c3d2abce83530ac64b4d8d9",
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
        dark: "12e6815191aba677c0bd757fb30c830bca7fe53db82212c52b1e329329b901ef",
        light: "c85927a335e95834cd5c341acef8812e9915382e99d922d5dbd163c10c511b52",
      },
      en: {
        dark: "3c3782ef658db19d9531cd407f25809d70ce992c4fa633f69abf73eb5d998d20",
        light: "7567f62c733185101cf02aaa701e65e56d597cbc979da5a22204fdc727ca1bb2",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-dashboard": {
    clipped: false,
    route: "/[locale]/w/[workspace]/dashboard",
    scenario:
      "Main dashboard with open pipeline, value won in 12 months, average won deal, overdue tasks, pipeline by stage, upcoming next steps without an overdue section and won value by month",
    sha256: {
      de: {
        dark: "e5fdeca5143a70ea6a2b6c6b03324f93b0cbc1da8e336f45106f719cd7fdc718",
        light: "81b370384b548bc03b23f00477baad811626e5c05697aa7453d5b2eaa508c1f7",
      },
      en: {
        dark: "bb8fcd2ccdd59ed8fc971a68e232c6cb4edd467a503d69a70a2fa2e7a2f15ba6",
        light: "9312b87577ea5428437a7123be3e4259ff2c7ef12ee09158806854e7ca70560e",
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
        dark: "5a3e431d3421201aa051e3ac8ce160b8bfd4a72adb2bfaa4d5e83078a2046796",
        light: "327a6f351298b0dd03b68cd872a76d8d505b835aab16f9ce364432089250cc0c",
      },
      en: {
        dark: "42eceb0169cbb33ddb92cf06e5c046843bf72a73d5606f75c192b1811452c8fc",
        light: "576d2b87395dd7578c050334b06b7bb0606035660856f8f284ebdeb00abdcf29",
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
        dark: "eaf86b517554e9f4d4dd3ab0b99c99691a28f1e8dbf0099471b9720915de8c9e",
        light: "76ca9a7cdd2b344206437ff3df74dae6350575710b5b10a83515c92b75cad98b",
      },
      en: {
        dark: "e67ef57e032fab88f3d92769b0e61fcce8cab59ea2a386303a0924af6895dd84",
        light: "ddd5a946fe78c15309673ff81bac9f10f005f48006914dbd63b5e03e5307b761",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-thread-linkedin": {
    clipped: true,
    route: "/[locale]/w/[workspace]/inbox",
    scenario:
      "The whole inbox panel, thread list beside the LinkedIn conversation with Ethan Clarke (Erik Claasen in German) from its first message, sidebar collapsed, at a 1024 px window",
    sha256: {
      de: {
        dark: "ebc976a206ddec864ea9b91620bc3cd566914471d3d560172283e7f61a654028",
        light: "c971f3e51482e1e8837b8d0dd6efcfe850ae8371a79c55eb995d2b1b94349e8d",
      },
      en: {
        dark: "c93fa82a3b27e97da58da39690da561507df7511a19fc2168912cc138f78db43",
        light: "7f1cceffa9c4c59480a862bfae99ccab837e770d82fad3eb78b32fa058926483",
      },
    },
    viewport: { height: 1000, width: 1024 },
  },
  "homepage-draft": {
    clipped: true,
    route: "/[locale]/w/[workspace]/inbox",
    scenario:
      "The last two whole message rows of the email thread with James Finch (Jakob Fink in German): his reply and the saved reply draft with Send draft, ringed in the app's primary, with the date separator above",
    sha256: {
      de: {
        dark: "e6c0f0b2b913aa7a2dbb328b184cb09cc0e41ad0266f4b63c6cf24ff0b52b314",
        light: "dedfc57698670554b8b461fcea45e2e3ea202504632c6e333bb366b6c5f56067",
      },
      en: {
        dark: "35ab80caf79515742bd634d24609a7d39de1311415b5b68a5d9b9de9d267e657",
        light: "a721e383f7b89a9e3f407a44390f2072336e8f80e9712aadf18103aa2c4d5961",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-pipeline-board": {
    clipped: true,
    route: "/[locale]/w/[workspace]/records/[deals]",
    scenario: "The first four whole columns of the deals Pipeline board, from the column headers to the last card",
    sha256: {
      de: {
        dark: "64e537be966f0446bf2fc532e0868bf6bccd64c30784101ebc057b024017fcef",
        light: "1fe8f8f8eb2e587660ecea9ca8fb6361b52ade1720521b7268bc39065061658b",
      },
      en: {
        dark: "b2b52aa7dc6d8731e099200cd7336a62973c7d4a6b4a65038e432ea638a0e7a6",
        light: "2579bcb79620ea918f685f426302d1429f6a7922cb51762622ed624ed306208b",
      },
    },
    viewport: { height: 900, width: 1600 },
  },
  "homepage-routines-table": {
    clipped: true,
    route: "/[locale]/w/[workspace]/routines",
    scenario:
      "The routines table of the small-business workspace (kleine-unternehmen in German) up to the Status column",
    sha256: {
      de: {
        dark: "68deea12e2856f86511e61fe1a02e2d0a9f49cdfd67be2ab3173e5c6f4be2576",
        light: "97f9337a4302adde5354a13be4cd86acdf18ac7291311695d25250681d9a2430",
      },
      en: {
        dark: "d7fe51ced4b393a7737fa04c7fc1bc423adcc2b46d5926fca5ba3af32f238a73",
        light: "1444e6649500fa0bf2195eb3bd637fa0bd1249b91f8f5d2235a3ea5c41ec3541",
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
        dark: "5b406442a900ee3179e2cdd7431a3730db0ac8f133709cac8153778658656a95",
        light: "848bdd03477c4ec729cfc0b097bf2e6e40f6fa4dffe159c99c4c4a46b96ecc06",
      },
      en: {
        dark: "737f893776f9a301a83f08055423207cceae8ed2af0316beebdb3ef3cfe3e583",
        light: "9a6ad72264f9504fae1bfbb4abe8ce0dc95b1a49bbb5569ce57fbc31bedc4b2a",
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
        dark: "ea5189471f61014a8570122b166ba5d5f863a88399a7e0953b4b17a22b50589b",
        light: "d0976194cc5cdaf5f052b321093a866531059a368b77700a532693605a3b3efc",
      },
      en: {
        dark: "97bc6b3794d73f66facd409ab65e57f95e67686dad44432d967abe129c0b9738",
        light: "c8a3405b7a9bff6481bdaedf16118316a125123440906218fc9034b9177bcadd",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-pipeline-mobile": {
    clipped: true,
    route: "/[locale]/w/[workspace]/records/[deals]",
    scenario:
      "The first whole column of the deals Pipeline board on a phone-width viewport, from its header to its last card",
    sha256: {
      de: {
        dark: "417904dbd3aeb09c8b7c6f0a9335fb9b4f5ee25a7d09de7486de53e2458a4a8b",
        light: "e550ae55f5f1f620db9c9c326a83c79f5a928a12d0b613f46e7ec0332546b372",
      },
      en: {
        dark: "dd07d57573fdb00d4bec11ac8373fe1aa063abac8869df8f72daddb36d436ddb",
        light: "a52bce383d3bc7da1145e80c9cec0ae122af597f7a08be003b2812e3a6275759",
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
        dark: "f16a2ca51f8e8124ee4d64e9d668610820777f651c8eedf166c59650d8c551ff",
        light: "41004c5a97b243257a878c7e8a9dfd2dbea118790e6a807fb1bd21e28123069f",
      },
      en: {
        dark: "c8c4e96ec2f30c7fb2fade74e97611abcaa57eaf4147c49a216a44b5b0d3b34a",
        light: "a70f41f87178cd4e93ad5093bad1211849c889b1210c6523a897d7d67ad0e529",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-routines-mobile": {
    clipped: false,
    route: "/[locale]/w/[workspace]/routines",
    scenario:
      "Routines list of the small-business workspace on a phone, the viewport narrowed to the right edge of the Owner column",
    sha256: {
      de: {
        dark: "206173a8f9cf2596f02bc7b8ebbd029303d8f63c4a57510a5b5ea3601016a273",
        light: "f3929475408fd9900c1f379d73a88e82466586e0d554beefd1b9ef305e5b2053",
      },
      en: {
        dark: "e5415d6f14110d1223bf29138bcf3fa2e222f316d41c251a782c50f3e8ebb13d",
        light: "8f51ec88819f37353aa0c3676213ea024c29055c3991f1c9f93a4856f3c29fcf",
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
        dark: "d6ddf7f9d74e4aa77210e82f8bb53a1536cbbecc3dd910d089cf417f95424648",
        light: "53153391863335c01b36695b20f7cf14f6437958b7c11b9e8d3d443c0643c2e7",
      },
      en: {
        dark: "e3a8e941e15831059292b73c0d3c0651622f9bb81e07da13bf11b80c74b0957b",
        light: "45d2ad2a4a4e85b3e2084f1d7574621dfe3d42cc6b1924528eda02b530845644",
      },
    },
    viewport: { height: 844, width: 390 },
  },
};
