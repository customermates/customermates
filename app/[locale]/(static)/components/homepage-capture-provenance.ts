import type { ContentLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-10-28",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment:
    "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed, small-business demo workspace (kleine-unternehmen for German)",
  productRef: "26145b8cd",
  renderer:
    "Chromium via Playwright (scripts/capture-homepage.ts) in the page locale and the workspace time zone, device scale factor 2 or 2.5, theme set through next-themes",
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
      "Main dashboard with open pipeline, value won in 12 months, average won deal, overdue tasks, pipeline by stage and won value by source",
    sha256: {
      de: {
        dark: "e0ff0998545aa4bcf9c08c6f03e8269f7dc837ec7dfc186ba36327a861edf8e5",
        light: "348bf4f1b36730379d85d79fe4b42d436fb75d6850c72cc56dd8c78c0a288bf0",
      },
      en: {
        dark: "57beb8798d39dbaf6b2cf54d3e24139348d10a91583677d9f3c5083987f3f1f2",
        light: "ac4f32126fee2fbe7a0b1dfafd8572832e8b576a693ae511b87a41dff436cf3a",
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
      "The last two whole message rows of the email thread with James Finch (Jakob Fink in German): his reply and the saved reply draft with Send draft, with the date separator above",
    sha256: {
      de: {
        dark: "c6f082863ffdea1d5c1348af692837ee38235a296573b56bc7722e55797f0045",
        light: "5baa4e77d17fd3dcfd62d4b53febd99db02caf85777532bfc6983024dddc4cae",
      },
      en: {
        dark: "22454c5d92c14fb645c9a0a92972ca0b11aaa5fdd3b48cb879370671e3952dd4",
        light: "4c3ceb04e58ea3d3f0c9ffd2a8c91093321c5dc07e13c4d80466d9022211e046",
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
        dark: "2a8f8332754fdb00420d2d3cfd6747486cf73ea630b9b7d110e8430f1027a8c8",
        light: "215bbea7f964c964399f50d2594fe9c89d19836da0de68cdb686c9ca323f6313",
      },
      en: {
        dark: "900c612853847c0cd7ac2f4ec70452e843d21535f35b743d055befdfa0a87049",
        light: "1a248598f0904959c73bffda5e2df20e15b0ff8c153b5fe457e832b2993c56ba",
      },
    },
    viewport: { height: 900, width: 1600 },
  },
  "homepage-routines-table": {
    clipped: true,
    route: "/[locale]/w/[workspace]/routines",
    scenario:
      "The routines table of the small-business workspace (kleine-unternehmen in German) up to the Next run column",
    sha256: {
      de: {
        dark: "24aa4c2d1b040f9bdad6c72bb6549e77ce742f504da203e0c80bb8268cac27ca",
        light: "1e81bdaf9a34b4a2af354851c9514ace29cf18ddda0df3339f25cb9ab22a4803",
      },
      en: {
        dark: "fc6d468b219de1cc7d6e763f14282ff64e91b0562fb1c279b55ea853f6735bbc",
        light: "2ac17dd67abca7f2be4563c3a62fdc9a1477365db5a3de6fb7db14b7d21a41a3",
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
    clipped: false,
    route: "/[locale]/w/[workspace]/records/[deals]",
    scenario: "Deals board on a phone-width viewport",
    sha256: {
      de: {
        dark: "09de040e91b8911219a6a220be38046c936bba2c471b218d4fee9269556036da",
        light: "c6675dc81ba02689a9d588a9f2f707d7735902b2097da9a3771a48016b092438",
      },
      en: {
        dark: "4edcab851ccfd0dbba80dcf966212ca560497572b45918b19d38fc76bf0cb428",
        light: "aed5a9fdce3a2fdac855005d0a5b5781fa9567a3671c2f45858729d43f9f10c7",
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
    scenario: "Routines list of the small-business workspace on a phone-width viewport",
    sha256: {
      de: {
        dark: "e041074c7baf84135b97a24214c6f9c41762cd7ef5c145b2b8e3ed9280e4d85e",
        light: "d1f21219c1de522250a3dd35b75bb8326cb739293c82723c27cc15403d033f1f",
      },
      en: {
        dark: "155966eb440bd05c5eb7d0667811120355c9caf66916c9244b78aee82df1d3a6",
        light: "47f89bedba30a746387ec2e60183ca82aea49f0686e8f533a8fb8399c6707b5b",
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
