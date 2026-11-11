import type { AssetLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-11-10",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment:
    "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed, small-business demo workspace (kleine-unternehmen for German)",
  productRef: "9a65f3f93",
  renderer:
    "Chromium via Playwright (scripts/capture-homepage.ts) in the page locale and the workspace time zone, device scale factor 2 or 2.5, theme set through next-themes",
} as const;

type CaptureEvidence = {
  capturedOn?: string;
  clipped: boolean;
  productRef?: string;
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
        dark: "226dba84acb5cada5e7c9eab967043de43f6d2cc2a7bdd19d37084b7d73d05b0",
        light: "c3f16ab2f1846fbca55e4c95cd8bfb334e968caa435580b071f9646552ce90a8",
      },
      en: {
        dark: "dd971fc190ae48e24db5a3e9a449acba26f8252baf20882e49a9ebe3a93eb06b",
        light: "ca9faefe2587b91604a9028bac8cc8f346eb5a3b32b51a2a0c3565339704fb42",
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
        dark: "655b76f765a8f4304ce5205711def50a587c1ec7d16121c3fa0804d7005125c0",
        light: "54ffa4c2c4c24ab53e6a076d74332dbcc2e29e46d5ac185f6bcf6a5391cd59c8",
      },
      en: {
        dark: "5d1ac277dd5c17779121616fe8c69b9105cc7ca0d0e993b1f79d11448663f1e7",
        light: "5cd10e6bb7923f462a219987e4a48c8a6bc1e8ef62d4603935cfa2be7f590542",
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
        dark: "5f44614e8e0e59cbd617cb1f8644e1c7bf3fcc96386a37867282f86a13feec8a",
        light: "eafac4f3bb97c6727aacc3ab3e3b61243fd8a50b8a2a8d71b47ba0f05d2dd94f",
      },
      en: {
        dark: "e00dc2eebf7e48d8e062b4b2dbe480880f6a86d38d3e1a1a9dbbf9a80ffb058c",
        light: "cf2dc0e876f6be072b15a78694d563f498d8d9245ba51032f190fcaf31858a4a",
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
        dark: "a35b0ebba0219cfd7461e3109bce862047e8c0cd45b667bd5a837f06fbd5247d",
        light: "5ead269c0f851034829a7f98eae01e693a6bf130466e260cce1250171676ed2c",
      },
      en: {
        dark: "3b2994c67e5a2997411804fd68fc334e54d81b5fa838a27e80877797727f4dc6",
        light: "a34beb674f5bb88d5a3f187c17c4921dbb39b52c04ca1698f539d6e150cb1be2",
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
        dark: "4c278790ddc5531bd286d9c3297197bdd20307a2ade44855ab2fb86074246291",
        light: "f4b33c0df205dcb2c8a56acc28872dea81ddcac14af00b26871507b43b6f69f9",
      },
      en: {
        dark: "223d545db89cbaa0c20add7b347b29101a7e1867c63dc831445c99e945a8f41c",
        light: "6553f6f3edf4adffb7e92c6c566ba9c80238f321cf74357867edd6fcb2d105a5",
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
        dark: "a62d06b3f2f411077409c9b801d062e3af74a867afafb66226c2ebd997c47c20",
        light: "ea5a4d1370384f2ab7461e81070c2a9e04121993cfa6ac6effc3dd7cbe41972a",
      },
      en: {
        dark: "eef9e1faeef70f90cfbdef5fb40b435a2eca33d5cba1b30f574d153840f3c396",
        light: "52497b634984c2c09a0511cd936028fb9e2679836a70b80c58815d2bf80b4ba2",
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
        dark: "b13b5a8d7b4d1c4c67d3c4cb16859e310096a3789dc6e8d4d156f56e8851cc72",
        light: "2a13d71cb7400b422fae83d518e885b4a499f8fd9b835c6fe68fe9bb6e6baed8",
      },
      en: {
        dark: "6e823aa8c4c5cacf4b53fbe74a40cd31111dec0228cbb7224e1128242f131696",
        light: "a1fbf7144b1fd2af4f25df297fd9f3b6ffebb3d2f665b09b477b7ae2b5c6c204",
      },
    },
    viewport: { height: 1000, width: 1024 },
  },
  "homepage-draft": {
    clipped: true,
    route: "/[locale]/w/[workspace]/inbox",
    scenario:
      "The last two whole message rows of the email thread with James Finch (Jakob Fink in German): his reply and the saved reply draft with Send draft, ringed in the app's primary (the date separator above them when no earlier message of that day sits between)",
    sha256: {
      de: {
        dark: "665255fa53f083e9cb6594a489e56599d3a4d2bb46022581d6f192b8406b6ea1",
        light: "73b068ac1d99a679827cddc8af924f397f9347923e9ba2db4257bc4d0089885e",
      },
      en: {
        dark: "97be3437448544beb0d494559b45dd3d96441eabfe6f4d37e8f9bb3aecc9bfaf",
        light: "39ad5e47afe7e3950a399314d73ac73ab82557875442c05ef8d4015ec5aef421",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-usecase-draft": {
    capturedOn: "2026-11-10",
    clipped: true,
    productRef: "9a65f3f93",
    route: "/[locale]/w/[workspace]/inbox",
    scenario:
      "LinkedIn sales story: the last two whole message rows of the LinkedIn thread with Rachel Dawson (Rebecca Dreyer in German), her message and the saved reply draft with its edit, delete and Send draft buttons, and the composer under them, cut to the left 500 px of the thread column in a 760 px tall window",
    sha256: {
      de: {
        dark: "87c2c3fad881430b505e8ee84d95fed13b0652852e02999f9c9d5b3c0d5e57eb",
        light: "d96e7f63555abd265ef73e39aecf3963277d8ee83390453c6b3c7353fa2e22e0",
      },
      en: {
        dark: "5c0f7ec8934812bad712229a45a51d476fa4689e92bcc3d3a8f45024302ae57b",
        light: "603255ab080dde46e1df7ec0c1f633fd57f85606c4be31b47a0ced0af06c2b7c",
      },
    },
    viewport: { height: 760, width: 1440 },
  },
  "homepage-usecase-connect": {
    capturedOn: "2026-11-10",
    clipped: true,
    productRef: "9a65f3f93",
    route: "/[locale]/w/[workspace]/settings/api-keys",
    scenario:
      "The Add an API key dialog of the small-business workspace on its own, without the scrim and the page behind it: the standard key and the quick connections for Claude, ChatGPT and Codex, Cursor and Gemini, opened at 1440 px and narrowed to 520 px so the choices stack as in a use-case card",
    sha256: {
      de: {
        dark: "5382774f93bf74ddff2102bc40c0670f6ff858098dc6035eac8e478539b052f1",
        light: "4a6d5e1361a80ac308121a0c7e0556fc170607ecc6ba80bb27731e3a5d0bfa1c",
      },
      en: {
        dark: "3ad0122d5d6bf7a3e416bf2f911dc3d0a4f5cd2d7c442b5846ecd9d2645297da",
        light: "798cf73271bdb920229ec0791c5f17697ea80e54b2a8d300272affb41155257e",
      },
    },
    viewport: { height: 900, width: 520 },
  },
  "homepage-usecase-calendar": {
    capturedOn: "2026-11-10",
    clipped: true,
    productRef: "9a65f3f93",
    route: "/[locale]/w/[workspace]/calendar",
    scenario:
      "The Calendar page of the small-business workspace in the Agenda view, whole day rows from today on: the second warehouse walk and the intro call with Harbourview Hotel (Erik and Hotel Seeblick in German), the Northgate Logistics site visit, the Pinecrest mailbox check, the access point install at Maple & Finch and the deal next step of the Maple & Finch network setup, cut to the left 500 px of the list",
    sha256: {
      de: {
        dark: "14a42ea7a4e5ef4cf3f0b1dd60ee1928c04ca997b7828485e1a3eff9ae1bf1db",
        light: "5b6b290546447a7eb0f2874b058f6a5ba3326656ec4aaf5867ffef2aef12f6c6",
      },
      en: {
        dark: "c9073c370828c9d7fd172ed6a2ffe72d8ae8aec1ef32dff05a2d6d00a39424df",
        light: "90b94f9a46ca3355edbd242143451cebd4ed70364f21c54c9e0b274007010a9b",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-usecase-contacts": {
    capturedOn: "2026-11-10",
    clipped: true,
    productRef: "9a65f3f93",
    route: "/[locale]/w/[workspace]/records/[contacts]",
    scenario:
      "The Contacts list of the small-business workspace with the First Name, Last Name, Contact details, Job title and Decision role columns switched off in the Appearance menu, so Name and Companies lead: the table header and the first eight whole rows, cut to the left 460 px",
    sha256: {
      de: {
        dark: "d2ceee1bcb3c9954c7fbcaab4380032e7d134e7ad3904ebd3d26df971b6894e4",
        light: "0eec9e9db3a12e9d291159114c38885fe42824b9b45a491a6981f98e348f5336",
      },
      en: {
        dark: "046565bea5204c8fa3973e34050f7941092a1aa54a9ca32bd1a8e72138ddb64b",
        light: "61a82cff7448ac1f457a4ba47e06cc9d8bf8ecde5e4d6994ffdde8b7e196d0a5",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-usecase-import": {
    capturedOn: "2026-11-10",
    clipped: true,
    productRef: "9a65f3f93",
    route: "/[locale]/w/[workspace]/records/[contacts]",
    scenario:
      "The Import records dialog of the Contacts list on its own, without the scrim and the page behind it: a four-row Excel workbook of new contacts (Brightwater, Harborline, Kestrel Studio, Webb & Co), its columns headed with the Contacts list labels of the page locale, on step 2 of 5, Map the columns, with every spreadsheet column matched to its Contacts field; opened at 1440 px and narrowed to 800 px",
    sha256: {
      de: {
        dark: "c2f16295a915acbcc816a68d0c6ec9ed6b9d19aefe95cc1507c93fd7ae3fc67c",
        light: "fbab11376c913e818d5109b38413cec273c285fb3051e2127f2a4090f9a346de",
      },
      en: {
        dark: "0de3f60844d8b5b979174f274289cc52e3aaf2b87f9e13865a5869b4523f0470",
        light: "cfc80f2b328a74a3660190b6d4b35050ab90acbc304140f58aacc71be6528eba",
      },
    },
    viewport: { height: 900, width: 800 },
  },
  "homepage-usecase-search": {
    capturedOn: "2026-11-10",
    clipped: true,
    productRef: "9a65f3f93",
    route: "/[locale]/w/[workspace]/records/[contacts]",
    scenario:
      "The command palette on its own, without the scrim and the page behind it, after typing the last name of the partner at the law firm (Finch, Fink in German): the tasks, the deal, the contact and the company of the Maple & Finch Law account (Kanzlei Mahler & Fink in German) and the Ask Mate row; opened at 1440 px and narrowed to 800 px",
    sha256: {
      de: {
        dark: "64ca03a55bbf77733d1d4f5ea3aa4a503231d6ddf0fb619e73d99c960f90c1d2",
        light: "a99fa0c8b84da0c5f10ea9e9086beab3f8ca781e1c87cb571dca88927132b1ad",
      },
      en: {
        dark: "d985283edf8f15a2a93e5b0040d06d9f51d011d37d1d4661c34e937dffd0bde5",
        light: "97336e8f87e94bac546a8c404b9a8bb68f2b5fd8c64740bf034c85bf26b64866",
      },
    },
    viewport: { height: 900, width: 800 },
  },
  "homepage-usecase-team": {
    capturedOn: "2026-11-10",
    clipped: true,
    productRef: "9a65f3f93",
    route: "/[locale]/w/[workspace]/inbox",
    scenario:
      "Agencies story: the thread column of the Kick-off and first month email thread with Ben Carlisle (Benedikt Kaiser in German), whole message rows from the first date separator to the end of the reply that hands the client to Alex (Frau Ritter), in a 1100 px wide window and cut to 440 px",
    sha256: {
      de: {
        dark: "b084a44c9e47e31ec44c5c4050fca260b739d180d64de4f670f2cd3dd82a86a4",
        light: "74378dc0037ccba7dba2c6e2d1b2ddb040a60bc4019a5ad3e1b888c16420345d",
      },
      en: {
        dark: "6bdb6f62d12d340d9955d200cdcc3998c3bbea235c2da883dc763310745ceed3",
        light: "9c34b2d6423866a9d568e32776694c4b1b2e2628f486608c5c8d863573a697f6",
      },
    },
    viewport: { height: 900, width: 1100 },
  },
  "homepage-usecase-playbook": {
    capturedOn: "2026-11-10",
    clipped: true,
    productRef: "9a65f3f93",
    route: "/[locale]/w/[workspace]/wiki",
    scenario:
      "Consultants story: the Knowledge Base page Day rates and fee options (Tagessätze und Honorarvarianten in German) with the page type, the introduction and the day rate list, cut to the left 560 px of the page column",
    sha256: {
      de: {
        dark: "4f6d8c267e265c96f87a078f2bfbc9ed10eb22d3e28c2ddfdba0b98e70926cd7",
        light: "6982c7e9feadffac22d0f22e8bde9accd7318dc58ae935b9006d560ed8325849",
      },
      en: {
        dark: "70d866ad57d5f9b5923ede9f41419404d5337cc5f9d7164363fe0779cc8f7c3d",
        light: "2e22d50b7bc5e755bbfb2ffd718ccbc07a3488bc5301e3deb697680a528eef08",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-usecase-whatsapp": {
    capturedOn: "2026-11-10",
    clipped: true,
    productRef: "9a65f3f93",
    route: "/[locale]/w/[workspace]/inbox",
    scenario:
      "Small-business story: the thread column of the WhatsApp conversation with Sophie Turner (Sophie Thiele in German), whole day separators and message rows, in a 1100 px wide window and cut to 440 px",
    sha256: {
      de: {
        dark: "63109ea47ce3369a63e33599e4d00afdbb5294dd195ea41c7912542b5b26e14d",
        light: "4f13b4b867b73bb99b522fe2ee32e59d8cd7714b38c29598aa1ddab544f3914a",
      },
      en: {
        dark: "97f6983d037cdc268339e89b80bcb2aeaeb7430bc617c9ace2205cd8107ec06b",
        light: "0ed98728365ba6bf2258cb57c111115df79edc5e331604c60408902cfd3eb0e2",
      },
    },
    viewport: { height: 900, width: 1100 },
  },
  "homepage-pipeline-board": {
    clipped: true,
    route: "/[locale]/w/[workspace]/records/[deals]",
    scenario: "The first four whole columns of the deals Pipeline board, from the column headers to the last card",
    sha256: {
      de: {
        dark: "26e7b3fd92676a6aaa832171a291819fa48d4c7c289d30d081f088a2c016fdfa",
        light: "bf87e13ba8a07ecab282fde8ea5e185858094cce15dc766295270dc70799cd68",
      },
      en: {
        dark: "77cdb790844ca53c3e77c64fa93a9742b509a9a27442105ebb5ae1b92751fb1f",
        light: "1b77a236a3de5bc87a6a3456b080f4e34ac3a9a0cafd08dda593fdc8e0a405ba",
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
        dark: "afbdaec26563a152c28fd2065b7848a8a4c14250104eab8b499fc5ace822ac5f",
        light: "bd5901a6685b24cec82c07028f7bc4768be9bca5f30d9dc474fb3395afabb0d4",
      },
      en: {
        dark: "becbfcb9620d88763f05de77789487e90f5fea4c7dd81b71e29b10225768dfbb",
        light: "138dacf1eee45d6e08ea0bb1e7acaf66cb3f27936a47b52af1818414a4ab4123",
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
        dark: "bda5223a3fb1e0936bb2d3ad78727e819cfb45a3e2397fa71ba3cd4ee3fe9401",
        light: "f1eeeafa6819a30a290e8ed833cc5cba47feb001113ed4022d6e8c3a2d8244f2",
      },
      en: {
        dark: "024dc11efdd87ae4645355777419810845d6d737fe2375dd5be1f43c16b4789d",
        light: "9feda9001e6fff477e66067693f9beff9efb69333b4839d6f63193d0e389cdc2",
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
        dark: "4d9c8bb78b8991aa7618289bc7391587f0d469168962f4a7b02fae52b726a972",
        light: "c7573ca0230e5abfbc78380fc3ab5d88a9953d9391736d55c98108930b1f8ce5",
      },
      en: {
        dark: "13e49e5bb80e8faa6ef47a0a6016a407e940c6669bb97351b417f1504ee69166",
        light: "34150440d3c03f85690a63f74702ac117d000dc76f0fcb06d35c2b84a5e2f54a",
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
        dark: "17928893fb82c9f497588cf02550bd7d62ea46f5ff2b9ac1797441fc0dfa768b",
        light: "8fc20b0968d73c7b99d15cb5fef8d7d1f8a3471a9845be968d916342a9cbcc43",
      },
      en: {
        dark: "54ccc21fbc21c5c916d0af70a03b0fa4e20492fc838705dfb0ca941b78ccac7b",
        light: "327800ec833ae7fce531202a870a7e3990b3f707dd8a50d58c962ba0439b1415",
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
        dark: "612f7328d69287f1f8c9df3fccb21aa5d6fe7513f230c1e6f314bb679f1e0102",
        light: "f538abc7f9bd700dfc960d70337b1b8cb6d5781669978dc4ac7cbff5d6207a3c",
      },
      en: {
        dark: "727b76c64dc8e7af3a9ce1b06da9a0aa3c16aa6d8edfaeb13f1fc7f7a4298175",
        light: "c42751547952d761103432fcb6422868a79db3a299bd1cfe391d54abe43cc9dc",
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
        dark: "7eca79920535b74004bd9b20d547e94c790145b1af797ab451e6ffef2271eff1",
        light: "b1ad0bbdd2910a3b25c25318de5e00d0f9b5e4f9b7d5c901eca77a9967ea7e28",
      },
      en: {
        dark: "780f201374e6898f933e492fdb856ac7a9362285f72eac2657beca6da9f12c76",
        light: "0dc32ef2ab8e0d6f3e3520fdf9a96a96bb36efcbbc8fddd8ab446c334bd500dd",
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
        dark: "7c1cab82da701117e0a5df234bb98dd7765686eea614ce790e8f564a21bf7a2d",
        light: "628e7ee00d2ac21178394b9245714a771a7002a1558ec07107d661ac2e67165c",
      },
      en: {
        dark: "196bff5dcf07e78d94ce42cc4bd73bf7ff9a302f231e7cbe64d36d69784cf414",
        light: "a84627c4bdc33a0cfa57939cf79a5cccf33ed77e3197baacee1c33383629d866",
      },
    },
    viewport: { height: 844, width: 390 },
  },
};
