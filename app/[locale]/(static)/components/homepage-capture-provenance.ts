import type { ContentLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-10-23",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment:
    "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed, small-business demo workspace (kleine-unternehmen for German)",
  productRef: "e084475a7",
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
        dark: "8adfdbc610b5014182a05bceecc30b4a3688a477ebb22826901ffeb32b94e3da",
        light: "0cbf6f3011c0d745f55251819c722b3b4c08d2185207b00a128360dc78040b62",
      },
      en: {
        dark: "96ba2c3e3418ba0a46d0181da67ddb7e21a7d6ede71b59f4aa041df207c94d49",
        light: "6c3a3a14a6fda5918901b4b61e5fde5ec5563c775d9aeb7d57dadee6cc50001a",
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
        dark: "a2d8378c252c0b9ef98268a0f1ce24aef85daf89649f671b05a4a7906ad9e6b4",
        light: "dfd63e544a91d09efadef6386287d444988b6901402499fe33ff1ccf4001b44a",
      },
      en: {
        dark: "9c7beb9c7689210ead50d758fb49939d7072769df6c5a4546efed92e3e253df0",
        light: "9f26cf981595439e960a9db1d05283b600b6aab90c022eda4c2d2b4a41a2eca7",
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
        dark: "5be8023ae93002687dcdae4843539d858577c1937bb4bac4de2f102ea172867b",
        light: "79c689624f130671aa8040b0fc9864dfdfbd6bf39801f25f5a08968b1a130e59",
      },
      en: {
        dark: "6eebb313ccc62dd439903b2e017f5f06911d397c415265468d92000db9d70415",
        light: "a62fd9cd4c6cdf9ea6d7332e8cab36274826b7718be584ad122e598d034ced44",
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
        dark: "6e7dc75fecd76b79f3ebfa4ce85ff8725e70cf38e082fbce540998b595f97086",
        light: "15df4ac9b8b528aaf7b02594839c7aee887e9f74b741fd59c2825cb973b1efd1",
      },
      en: {
        dark: "91d30f2418d13883f56137379bf99937e073266dd77ad66f22d7ecbf120c59a8",
        light: "0eeed288c510866019d203afdec687a88538a237bba36ac7c5835cc4d644e360",
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
        dark: "3abda609ba643c5e0273e42f43bd64812b30afee6bde54ab87034209c223365c",
        light: "fd0339510d13bbb6af697a3d977d2da2ec1275aa0d43b5c168ac00a479a736c0",
      },
      en: {
        dark: "a5c606e789580ef27229968e1c7e8a328709c2ca4672e868a0687986fb855dd6",
        light: "61631b681c85144500227a7f6274b1140a360cef9819b66ee3a233a8b3ee3c94",
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
        dark: "432043e4137073335a929fb0860b68eea98a643ecf6d0e028a6efc2524ae3f90",
        light: "8799fdc30dc08cfb5ee66abc960d5fad8255f72400ea8b10c85723010321e1e1",
      },
      en: {
        dark: "780b056691d858da9163f8b2de43f0e9150b0069a59728f83cdc65371c629c98",
        light: "fd54b32f9cc50edc235a0d66195fda85fb5cc9f4c13841ef0467cb9667de2e1b",
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
        dark: "80454eb1d32c9aa8cae39a8c3d6d4eda45e7538f32f1531cb1c8f50d8541f13a",
        light: "5f6df9e1630e8f368b0ea6485d84e6d33fdfe7e361a67deafeb366fc87153186",
      },
      en: {
        dark: "894b2d180240514a073a70a24fe24158039695567fddfac4037024aae1b448f5",
        light: "d40a6d964af8e8f6a968140cc1a019a43b0a30382d3c8151201ed500b82666e3",
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
        dark: "51744bdd0c120670c1fc7c26de535949b3c209e682f6497945c4214f9cff37b3",
        light: "e7d0a90884c3dcc671f32c99d0c167641dce6139076278365664f9f3a457893f",
      },
      en: {
        dark: "625a2e94b74c38a9ea62dcdc8eb3be5ab675265b954d1c7d74b7f9a3b6a7b269",
        light: "8385a16a35a4a56114574d7cb20d4960844f8f4425acd911a787175734567a08",
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
        dark: "aa83f25fd732b056127497130e375899b00268a414899a77e600d1ec3b4a17d5",
        light: "dc734c4e13105c4e91278da58adce85e6f746c16e3e1d6377c4b35d73ec22431",
      },
      en: {
        dark: "07377f46ab10e842f640f4a2128279006516e48665129b459bb8bb4183c6b900",
        light: "aba280ef2bc737c47c5df37e7666ad14e0f35d2b72b2ba9d998457a5278b4c6d",
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
        dark: "58b4e60b07b7e210160eb6566ca3306be75205741a31b27da890c2690ab5ca11",
        light: "0c15b6a89cbb4a0742f5071792445bf085f7b45d6ae25cc922620298baef1e78",
      },
      en: {
        dark: "4de33d1adee4f11a2f68fb4e47c91754df7252802c6b63264d572efaa3729c2c",
        light: "84118add771752befe26ea5216fbe9fe2d57084f0cbd09c11e92b206fcbd8df9",
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
        dark: "d452191eda4eb33f60575b433c04ede87ebe4b9d54842fd659cd6c03c8714676",
        light: "1766cd742d8f6b10bcbb758bffeb4b7f6462cac9b3a812a06d2f36b88716c50e",
      },
      en: {
        dark: "43d0997c6f1716b6771cf9530a04ce6c579bdad2d8c992571458589490507f4b",
        light: "2405d055d8e80373159b6c8ba202b30bd8876543b476ee323b0d6654b84432b7",
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
        dark: "b8f84d0868d5adaa9782204de1a5f87de1f658ae80bd1c2bd21c8c13645c7a30",
        light: "6ba5461c90f572e3c7a68791c6f8cab8390e7be6faa2a13a1cd99f26149376cd",
      },
      en: {
        dark: "ea24101f305ea868c7bd1dd958198a5eff787e794e48848eb1a6d9bcbbafa1d5",
        light: "c6e18a7405d5398a5794318fa591adfe0585457794e95f1b3960dd2ba77bf104",
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
        dark: "761afe38a794a3b9356a168dd38e4f66711c717f018861e7bf74d7d97d29ea24",
        light: "1ec012600ace148e50b6dac0f632ee85ff3ea264f1adfd6dc0b29ca23f8ff10d",
      },
      en: {
        dark: "a58c7fc2eae6c19b0148d0a61016cd02ef7660b1dda4595d23a3fe4ab5f13137",
        light: "b82b42938f3dd9faa446196f5e1aad07276ad3e78370f95e987000b153576ebb",
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
        dark: "a4c06a11549a29ed76c9615e15fe8d0f731578f9e4379ce9f72cd5bb2ca29799",
        light: "c1377ba85bc69d8e1713c876818445243871e370d78152defa2ea87503d3c4a0",
      },
      en: {
        dark: "4c8181ce92f0e1909bc64109c3837d30ed46503a26c9b8432733e638d3847210",
        light: "abd62d14d3bb9fb88f7730e4e44675b9f667e206d4be836b23f47d6389e55c3a",
      },
    },
    viewport: { height: 844, width: 390 },
  },
};
