import type { ContentLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-10-23",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment:
    "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed, small-business demo workspace (kleine-unternehmen for German)",
  productRef: "55d3a9434",
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
        dark: "3ddb547dea224150ea7d037c3d52c53d9951387e37e000cc703c8bf24e9e78f1",
        light: "5430a9f3cf181ac6705e6bde734a76540c932fce68b228b7bbc5777b627d4c2d",
      },
      en: {
        dark: "f24f7f76a34cf495e684642664fb1d0ed3ac2ae1ecf92969ce8417d52a8cd8d2",
        light: "d4b8c151018af9bb9a8b4c4953b842fcfa4b0036d061c415a504e99b677646aa",
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
        dark: "f2c90d88d778931672d3a28494a9ea12d4bcc6e83363296d7abba3ddd3a6b6e5",
        light: "3358baeae8b14d434ad34c258178310720571e1b324d8aa8258b74bce01fc0a0",
      },
      en: {
        dark: "cbee5ff19ef7f3b3ee8649fd256dc72cf9b2bc92d25366404a9b734d8a482f4f",
        light: "56ac2bbf3ed5af0f3aa7b5e05728d9b4885f0a0f30b95972275782ea75f9c303",
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
        dark: "e62dff1abe8d11cb2341223107ab20cc0783005fdb7a19f5fbd666c1cd3b6d63",
        light: "3c9e2df0e2f4c303e7ab00a47fde5655d06be8357a953119871c5013ab9f425a",
      },
      en: {
        dark: "872fa0e3d0b1d76247d34e5d9d4d6812bb228e64465c3cce3d1e0991e19e8033",
        light: "2168a6a7196bf97d5e0c07b38d95bfeeb7b157693684c0da6fc5e6d4915adb26",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-dashboard": {
    clipped: false,
    route: "/[locale]/w/[workspace]/dashboard",
    scenario:
      "Main dashboard with open and weighted pipeline, value won in 12 months, open tasks, deals by stage and source",
    sha256: {
      de: {
        dark: "161e5bd60299459abbb2965a3c851730f49567ed5371b89afd92af7817cf1d2f",
        light: "664a9f3af17d9a6465e195c479cd4622521949d44646448cba97df6eabae2ee6",
      },
      en: {
        dark: "a82f71ecbc7033ae672a26239a91905e80751ae377ef1ff6edf376cea6f61084",
        light: "0a367fdd13cf1d1458d798c7613b065d94cc86af4a1143a4a0f77dddd7a34164",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-routines": {
    clipped: false,
    route: "/[locale]/w/[workspace]/routines",
    scenario:
      "Routines list with owners, schedules, triggers and last runs; only the English small-business workspace has seeded routines, so the German capture shows it in the German UI",
    sha256: {
      de: {
        dark: "5435ec06a51af21b3c0df60aade9a17710705279c41f173748f4d35357c58912",
        light: "3d3c99834cd1c8cb4cdf16c39407153f768b7a85d997d0b973dc2fa63d663ba5",
      },
      en: {
        dark: "3015b0123b325929f9c735dde50334feee11b5fa9e05242861529e039be3826a",
        light: "b6b5892243fa85d824f104fcde076fb701abce3ce2eae1ba299c2e30edb5cc26",
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
        dark: "94c1b63dedb2a691a77d15fde8d037a3f5597b09cd8c03b101c85f75c71cdf18",
        light: "6e8df7f3aedeff953b9f31773811a9f3531adcc1dac8743a357e79bb0a5430ef",
      },
      en: {
        dark: "de4b175532b08f314067009db9af1d6f74582d11166c00a397174af361c1a0be",
        light: "68cdc6f84acbf9c9774212d92b42e154c82a497b3920826519dc99d5ac1e0ff3",
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
        dark: "c9a1f4618afd245b1ab8b1487236486e2be5425ac07c9e03cfed92f224b802f0",
        light: "6160f0639fa79fe37a2fd118a0a2935545c012bea2378014a173123e9a8dce07",
      },
      en: {
        dark: "ce71a270ba1c7f2d5df5128680bc9d572d487b0939ae08ffd5113cac37019b5f",
        light: "05c74728a1aa92688b0371181e0aa5ca6335f5b4855a9295c3ad79d037679776",
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
        dark: "ea2bb8acd4a204794e5703f152b4903ea3e3822f3c1d6e031dbdde412a1acc83",
        light: "ea2bb7087d4ed54e59af134c043f650d711c6709f2e54cbe9552d40d3e61ad54",
      },
      en: {
        dark: "2ca4d40561e5ccb0e1be4c00097f6f1877c40b8f91861db784c2da6291dce369",
        light: "b230ab3dc85ff9f635b67d2722ab2acebdf34952a4601f5982c110681a0b9a2c",
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
        dark: "614f5db7fa3ecaa36fae1cf790aef1454a29669db7f912bc5595c406dd67a0ff",
        light: "fa247fd2d60287f4e5e6e120f916c93deb2691ab9e52d9600d0e848d697b614c",
      },
      en: {
        dark: "d5607f4effd227b4a09cc435925b4a8d868a07c6233358f978acad4ed765def8",
        light: "65ab0d5b52c07841397183073191a9c1df20ab501fc49d6366e558897971a214",
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
        dark: "412dcb86622fce94a45c1aac593db3375c08d2411a49b9c8cee37de66e87c3ab",
        light: "50799af4a99d125f75a3d1e3f3147d862f98ef2d61bf553084e2be7224fc48fc",
      },
      en: {
        dark: "a603dd7328e0c8196cab9819011ee580f67d4a6799516e7849ba30dda88bd9f0",
        light: "4db83b8ea280b502e972b6c0a5c17f28a0871fd366d60f1e4895d0bc5cf1cd37",
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
        dark: "7f8b72560151e624eb3555d43b249c409dd39c1fdb01faf30ee2cbd27071ac4b",
        light: "46ce031f944edfb06ed78a2c66ad083b6db8fdce8b622d5d0525a342eda59b15",
      },
      en: {
        dark: "a4e4795d73a2f9cd91bc7b504c549a775fc1b83b64005b8fdd10c81b66fd83e9",
        light: "0e00ea4bb4a9ae5c1efa8a09646b39e44ecb8f45caf0c64d0ff485f5d450a349",
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
        dark: "b6e6080d5f45f78957794f7c5da353b524892d978b941c1d7dab7796b3832c9b",
        light: "545bc0afe031f62851be48ddcf9f13ee61f02d03b5ca402229b5bf6b6ae8c751",
      },
      en: {
        dark: "c1a332b754877a3d2736fbb2656e8fb9672641bda3da436632203692d6c670e6",
        light: "72647b8d8df2e81c7762e1c38c799b3c8b863930159393201a78f26ee570d1f3",
      },
    },
    viewport: { height: 844, width: 390 },
  },
  "homepage-routines-mobile": {
    clipped: false,
    route: "/[locale]/w/[workspace]/routines",
    scenario: "Routines list of the English small-business workspace on a phone-width viewport",
    sha256: {
      de: {
        dark: "ecff64178f446b81b8790d3a3a5bfde84b3497506e83b465b58f6e309aecc66e",
        light: "95ef360b09a4b4c0813c7919e85ec19716cc47cfa9ba2d1db7596bb51d973c39",
      },
      en: {
        dark: "c85b93a1dad201d7ff58b4420fce28029cf1ec6b02e2319405ce3bb7ddcdd71a",
        light: "384b52c24a84f3f411b757a47d881bf0def16bb675cf35658e8f2d0120ce3793",
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
        dark: "81c797e65f946fa75a85a2766db88b00495f5ccb31bc62ab328dd75d6f3ef6ae",
        light: "6f3af2fbb97e5ffb0ddb5edbb77e18de0d972f276630ec511984a0c199816361",
      },
      en: {
        dark: "e9ff7ea2f417f84ae0de4388d35f5d402d84ae441ae7125e9c9a262a3c307b6f",
        light: "6275a00f90ec80570acb55b92c334ea354a3ea28432ff6bcd553119aeb661caf",
      },
    },
    viewport: { height: 844, width: 390 },
  },
};
