import type { AssetLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-11-08",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment:
    "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed, small-business demo workspace (kleine-unternehmen for German)",
  productRef: "c477d535e",
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
        dark: "11b3c1eda8c08cfda375e9ad73da227089a633f0e2d677893aeb0c7fce4b7fd0",
        light: "0b9d924cfe43d30aece1d0aeae1b0eb80ee313037609d4c6ff669d81565187f0",
      },
      en: {
        dark: "f485891e08d8d82d4de4474f1e07dfcb659fa0bb21f6a153d7390dfc66905a49",
        light: "a375f9147942ee6cbd00753ad45db3261116a054b65e9ce4911f7a7ea94bb5f2",
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
        dark: "49c074c0951c3c7a6026088344783f5b4555a936e6e08b20a243fb09c2f95e22",
        light: "3d1ce25bc298959b89355acce82ba09cfc7a2916da30e45af997dadd187f4575",
      },
      en: {
        dark: "5cefb8f7d9698a435232e89cc9650919b592174468c71439b2219b7547330636",
        light: "ed65caa4edfb28c8d79744d9c0e62113a148ecddaeec67b04ad2e03de5f0556b",
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
        dark: "95b5797b0a1de4e7157308b183085bd4694f4e010ee7f0907142d43e136d4322",
        light: "9a8aa3e68ba3f96b2678478527cc5a41ec1691825e77db943ff916ce31eeb51d",
      },
      en: {
        dark: "132809aa8d3cb755d59530a53493f3c1412571157983e6113b24fdbb029cadcc",
        light: "9f7d222c5a8ea1227ebf52c10a6571f8f6071148e7d3840eace8cb7643603901",
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
        dark: "75644da5d63cbe9c9a6d7710dc8e1ec1c3e46034794a7354a6480ecda6be4732",
        light: "894e3cf75dc415a66d987ff2fecfc0828df27a67d06c74496f478bb4977eebbc",
      },
      en: {
        dark: "8e6cf462ca377de91b21ca95867bdfd5a7ab373050716b5f43ed58e8ea47bd9b",
        light: "df73e1fbc801221ac0a0c1254a9622fcf00c766d336c57f362e62ff5c6859c4b",
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
        dark: "f37f45ebf2a83cb67bbc6320674683b33be4cf5905877ac6799931e38154c3af",
        light: "d9165433ec6c99797f173b95c91a92d85fe60a9390d495f0843dfe10e9b09e39",
      },
      en: {
        dark: "e27b55b55b3aca86268e82d25368ebe9d8953dda686eb46cd842cf3cd137e351",
        light: "99ffe4a90f49488e302d246bcc077368320215c417878bc011d2a5d45b806944",
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
        dark: "61626a5816f5b7221d5d98de0976af1f51f35bdc56ab79f74aeaf41e30356623",
        light: "9e1ec56fcc4ba480d3589b444d5e950f827ffecb43d41978406821b218eceacb",
      },
      en: {
        dark: "113cf98c2b8a69c55fc9fab1941c1b022c266124f43c8884a6f3ef465ca91b77",
        light: "66203bd3b55773e8ff4898ee049a20f518e879791abf76f90d353997c26adfa2",
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
        dark: "45fbcb0f4c581266dee11d2facb9f5ba1c77ebd3d8a719a35ed6ff285ea97d4f",
        light: "e156ce4f072a8b7fe010a90f9cc57bbe6e0d935825be6430613a91dd7f583ffa",
      },
      en: {
        dark: "07aae08b4221f9acbd078dfa7a7d5de00073cc5fdc257a9014987e8c3e167e8e",
        light: "87d928d6611d0e5705c25c27ec734f78ba4fde060e5b73e3620ead7cde19a7b0",
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
        dark: "f9b06074721d134b050057d68788447d1bf7998d665138402bf3455bab624d0f",
        light: "61be47b3e4c2806fdec14932af9c95a619c29c8e2c063cb6938da1624da3933e",
      },
      en: {
        dark: "b7f6f45ec62c8afd67b35c81a8f5744b7997868771b9dde8be7e2f45376ee081",
        light: "d462c756aeb5ab78ba26453e8d50fd1e04c626366bc36b3743baa1196cd12d0e",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-usecase-draft": {
    capturedOn: "2026-11-09",
    clipped: true,
    productRef: "dae379b5e",
    route: "/[locale]/w/[workspace]/inbox",
    scenario:
      "LinkedIn sales story: the last two whole message rows of the LinkedIn thread with Rachel Dawson (Rebecca Dreyer in German), her message and the saved reply draft with its edit, delete and Send draft buttons, and the composer under them, cut to the left 500 px of the thread column in a 760 px tall window",
    sha256: {
      de: {
        dark: "fe2b30097fbdb33be5ae80ca0556db48733e72e6983e670cd28ace0eaadacb85",
        light: "6a17aea39eea4e4e873337cd0c1d7781fa90937b681f854b2029bc77bb8e878f",
      },
      en: {
        dark: "083d90422b2491453debee5089328b2a46663077c5197a20c30fe8a4ccbd43e3",
        light: "85222a767e554485d93b8a7356e808d5caacc7b0ea2c66895c24476d0ab9382a",
      },
    },
    viewport: { height: 760, width: 1440 },
  },
  "homepage-usecase-connect": {
    capturedOn: "2026-11-09",
    clipped: true,
    productRef: "6d6ef79e1",
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
    capturedOn: "2026-11-09",
    clipped: true,
    productRef: "588c78467",
    route: "/[locale]/w/[workspace]/calendar",
    scenario:
      "The Calendar page of the small-business workspace in the Agenda view, whole day rows from today on: the second warehouse walk and the intro call with Harbourview Hotel (Erik and Hotel Seeblick in German), the Northgate Logistics site visit, the Pinecrest mailbox check, the access point install at Maple & Finch and the deal next step of the Maple & Finch network setup, cut to the left 500 px of the list",
    sha256: {
      de: {
        dark: "e0318fc81c7e510e0730bdff1c147fde7790bec26bc3edaa2b40c4d91985993b",
        light: "89a207223b783649cf0b2004dee91a4bf73a1876171eecc3a70fdadaba763f25",
      },
      en: {
        dark: "e357ef2564c5ad1f17eedd2a045702e8c02e11e215dc1a315e6dfe08b1280f04",
        light: "fb44bb9416f5d9549b5acc6499db775b7690b3ac72866fb305164664c892a344",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-usecase-contacts": {
    capturedOn: "2026-11-09",
    clipped: true,
    productRef: "588c78467",
    route: "/[locale]/w/[workspace]/records/[contacts]",
    scenario:
      "The Contacts list of the small-business workspace with the First Name, Last Name, Contact details, Job title and Decision role columns switched off in the Appearance menu, so Name and Companies lead: the table header and the first eight whole rows, cut to the left 460 px",
    sha256: {
      de: {
        dark: "53ab437b63650fd4918f29ee92ff62626c4b3c88df0eb1193f7ccbca00b693a4",
        light: "7a1245082a800b4a0ca936ada36e2a2bb34fece1132a4a99d12cc77426a9cc1d",
      },
      en: {
        dark: "62b0edf64e0a11d2f5f40fd228e97a0d86d98d02218315c4c279fb62626fffb3",
        light: "b72616954b4cd664e68fde398c0656ef3bce80ba28521fd5ed714a94288d74ba",
      },
    },
    viewport: { height: 900, width: 1440 },
  },
  "homepage-usecase-import": {
    capturedOn: "2026-11-09",
    clipped: true,
    productRef: "588c78467",
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
    capturedOn: "2026-11-09",
    clipped: true,
    productRef: "588c78467",
    route: "/[locale]/w/[workspace]/records/[contacts]",
    scenario:
      "The command palette on its own, without the scrim and the page behind it, after typing the last name of the partner at the law firm (Finch, Fink in German): the tasks, the deal, the contact and the company of the Maple & Finch Law account (Kanzlei Mahler & Fink in German) and the Ask Mate row; opened at 1440 px and narrowed to 800 px",
    sha256: {
      de: {
        dark: "38d8673129a779f68f9445edf9127719a0e72ddcf006018a01bc8122438caac6",
        light: "6cebffa3175c942e392d5fa8fdc39484e149515fd68c1542bc4cc13e1318484b",
      },
      en: {
        dark: "067c68df6c105c54b5609926c0977172d272b9eba56b9866ae3e530a85c3b3c1",
        light: "e836d9b8f9871575f2f4cd5d770fa2577e27958a56d241c3a3986ba55c529682",
      },
    },
    viewport: { height: 900, width: 800 },
  },
  "homepage-usecase-team": {
    capturedOn: "2026-11-09",
    clipped: true,
    productRef: "588c78467",
    route: "/[locale]/w/[workspace]/inbox",
    scenario:
      "Agencies story: the thread column of the Kick-off and first month email thread with Ben Carlisle (Benedikt Kaiser in German), whole message rows from the first date separator to the end of the reply that hands the client to Alex (Frau Ritter), in a 1100 px wide window and cut to 440 px",
    sha256: {
      de: {
        dark: "8ca38805832ac0eef7287f0aeebbcfed4f81985cdce4f46eb3230d877a2383dd",
        light: "bf7901e3e48b8a1ad843189fb239c99240889703d47be146380cacc67d031532",
      },
      en: {
        dark: "9da138dd56918e2bb91453b3b013e60f11218841887570e7ebb044f1f6d78aa5",
        light: "cf4cdd010dab9017f584e0ff005c0035253a50931b072771868b3b523a73c428",
      },
    },
    viewport: { height: 900, width: 1100 },
  },
  "homepage-usecase-playbook": {
    capturedOn: "2026-11-09",
    clipped: true,
    productRef: "588c78467",
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
    capturedOn: "2026-11-09",
    clipped: true,
    productRef: "588c78467",
    route: "/[locale]/w/[workspace]/inbox",
    scenario:
      "Small-business story: the thread column of the WhatsApp conversation with Sophie Turner (Sophie Thiele in German), whole day separators and message rows, in a 1100 px wide window and cut to 440 px",
    sha256: {
      de: {
        dark: "2ade6058e2fe87a55f1310a6d5d599a290bbee466e66470b0332ff266571902d",
        light: "f0f22d884673f9e76cc1598b65e6eb10b95b322d11bd79ebe99f8ced0a544e9c",
      },
      en: {
        dark: "5aa8eb9d9e6bd226a33ad0a2a74adc77937040a1660c958ffa482bb972419c1a",
        light: "b3a7742b1c5b620bb6b86f45b7e6dd249f293172fb2cc9f2ecdfa244db748e52",
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
        dark: "987814bb02c03bc0e422e16f9c7281a5a643a5a3d8028601e96d81b4a5cc3375",
        light: "f12ccd66b8733e3c9588836cd4094b515f21aa6bbf9e0bfa08c47cc2120d8f6e",
      },
      en: {
        dark: "84a35bc1552cbfb12df7ed0de5474806e8d54ceeb7afd4b94a54194377280312",
        light: "010e5fa67c3e53074a03819f91083b6715a8a0a762eff35980adcff038408579",
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
        dark: "5de022d67009aa27222937a0216d835cc59d430729df500001fae62e9862aa11",
        light: "858c8a81893d730007ada049ab79b9639bf24cea4ff517102204ee3db05dd178",
      },
      en: {
        dark: "af77a74b4ae97c6a4cd58a481ec79277839a9aaeddb50811c588ab74a21485f2",
        light: "86a32d45f880fb59bd1e776d621f0e36794da4c53b8ab32950c462f0c4addc0b",
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
        dark: "5d4ca327fe14f3c4ee3b5cfc1cf983e1d7ac950499623dfe024b77283013c7a0",
        light: "0bbd6d7f327a905f1377ad9d9a24e8ca211c3ec171ead1f182afb16501f73f29",
      },
      en: {
        dark: "273af6edd63cace7e6486d4767571c3f7b7e84e0124c43914c202c16844bc8a7",
        light: "d6104ebf8d40e264f51f9e62162a2bbdc941602bd56eae90c39de1f089265b17",
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
        dark: "89a03a8a5746463d46fb20f02ba9198dd4bdafbf82349fe128283c781385fdc6",
        light: "91f9ca40e7f2941cb3174a4bc646df80d21e6f43ebbafb90cce8f836c7c40f00",
      },
      en: {
        dark: "ea37490728a470a44512474f1f3eae4cd5aa04688b5050e2e58a0e77668afaa7",
        light: "49aa2c1a23629d6efdc318ec770d4d40259d3174a555dd6e182f83726c69419a",
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
        dark: "ae5bcf1c46a8032090213f7bd6bb7246e696e8963e266930684bd2f819b935c2",
        light: "792750ea903b3796958d3bcd9cc05f11dbfc5c6bcf0396b9b3d5d951add39c02",
      },
      en: {
        dark: "1d6c4a91d4ef19404be4bee0a7f7e1cc458763951bbd567e91409a4fc325bdae",
        light: "62d2903a25e5045712eac6a73bcf46fece8ed70688e40e3b2b8dd7c6c046ebc6",
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
        dark: "071eca3dc0d43547cead420f3397dc03179bc7a1ed4e1c9f8f7b9cf9b6e82f86",
        light: "1cb5f85c5513d3837be345f550ec75b61df7d58a18fcd140bdc65cc594165aaa",
      },
      en: {
        dark: "dc8c583d9ebb9af5572926ca6939503132e251a74a04d2f99dcf5b730f886d09",
        light: "bd195cc4af0ffd2b8d45e633ce564da2f48e499408b5a41292282b29214318a5",
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
