import type { AssetLocale } from "@/i18n/locale-registry";

import type { HomepageCaptureName } from "./homepage-captures";

export const HOMEPAGE_CAPTURE_PROVENANCE = {
  authenticity: "real",
  capturedOn: "2026-11-10",
  claim: "Real Customermates interface with synthetic demo data. Not a customer workspace and not a measured result.",
  environment:
    "Isolated local instance, APP_MODE=demo, fresh PostgreSQL migrated and seeded with prisma db seed, small-business demo workspace (kleine-unternehmen for German)",
  productRef: "9a65f3f93",
  localeRun: {
    capturedOn: "2026-11-11",
    note: "Spanish, Portuguese, Polish and Dutch captured in their own run on the demo stories written for them (workspaces pymes, pequenas-empresas, male-firmy, kleine-bedrijven), with their own people, companies and wording",
    productRef: "edf88e66d",
  },
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
      es: {
        dark: "a295df3d84b28e72142134b2ddbb0ad235a6bf008475305d91a7ca1f99a3ea35",
        light: "761a5053791396edbbd612833b76a651f550c9bc270abf17c1794cd75ae5e83b",
      },
      nl: {
        dark: "7b05ce6f140dc733db075ef320842781a79bbd146115a029369aeeaefcc4eab7",
        light: "cb275a45c9f17ca4c96a8124357ced302bba218c066006613f804d1235b5809b",
      },
      pl: {
        dark: "94804a18583ce6204b49f0e677c71519d9645872877bc50bb8c8343ff9cded67",
        light: "0b315c0125c4d6cd7416ecad3f6c1b3caae8a91cf5cddb6ab81490218ed2083b",
      },
      pt: {
        dark: "6b97560d7cb4c2db5dbdca4e49cc1eb8060e9a5f489409f746e69d394964b270",
        light: "15ddd0b30be7e5222a09e1ecdc92937852a15bf49903685e8099a50b5038eb45",
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
      es: {
        dark: "c778cc80ecf2721dcf8553589664f3c4161aae1db604b0188f4f33d546cb3bf3",
        light: "e5fd4a11089c5013b954caef484a0c3bfce2d2dc241864e8b1991ea5d07de6bf",
      },
      nl: {
        dark: "cfcc33fbaa972e8b8d1ad34d187187bf21a26d2bb1983063891bf60b4f5ac05f",
        light: "a4bf37c1d5fa64d0b672e9934e93c7910ae8ac57455f4c6aa20631974460f7e8",
      },
      pl: {
        dark: "fd36582fd88cce0139352b9c5067bdd3034de641beead3c71ac40492a6e01c35",
        light: "35cb70ca07c8bf8f85620e611ef9df95f26eb00e832d5b5cf98e457a87daaea8",
      },
      pt: {
        dark: "a3b29dcaffb72673be27d77dc64f61372076e6bfcbd28db3fba992e761c31ba2",
        light: "37ae06e8036345065f33791d97bc41ac5b0557cb16ae83af8d62816cdebd5445",
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
      es: {
        dark: "67bcbdc1f7b89d0751389494dde37e090bccee900c8e7fcaf7adb33f43529366",
        light: "a2ca5b081012daa10a2e35803a3cd0f9820e7bdf9ef20dfd13e8c7310924fcd0",
      },
      nl: {
        dark: "11158a1d8c61f78bf288a73f2b7906f6f31ac206c4462df9114b8249f4608d0d",
        light: "6c3eefe55eed837f28bc9c1080dde4660fc66e47820fc6dec8a42e922893fde8",
      },
      pl: {
        dark: "a5c8bb3951bb603d68b15b7de0288f98aaea32bac9f8f56cb5164e6a252aa57b",
        light: "ae70ea2e698dfc690f5f68e53322353d49ec92684fd8d1fef085dcb714421148",
      },
      pt: {
        dark: "7d55bb84d6c98bb17aadcbab75da7f2e5d6bcf19a975f6e3002c3315260db2e4",
        light: "4692bf74510a766cb650b4fffb43cab8de4ce9667e466816c7a5c1dbaa444a47",
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
      es: {
        dark: "ae7a09f0c8623953ef6cce798e4848e95e7b3cc87521b00ce0ed522368b3a93b",
        light: "e805a7154b486d96107d60fb29d970ab33ff66820a4016e6957cdaec85b6a5ee",
      },
      nl: {
        dark: "05daab238a3e6c3e23337ee0d34eda3f4c988ec135b7e65f5ca46fa079eff928",
        light: "50cd12dc047cd804d4a7e716d38c63b7ed3f3ee8a4c099f6f4481db93fb0e99f",
      },
      pl: {
        dark: "6070c438e3b3060188a45884d7b8497a2e116436ce56bb98f16531865ab4565b",
        light: "22a92d74ee54fd947bd5339f744d00e340ff2f8e31215213d2d96fe8bef2cb57",
      },
      pt: {
        dark: "ab0d9cbb03f98e27b942fe33c77ff4e51257ded69f477afce2c898bcf3fae90b",
        light: "46f6d45cc36e586f942802e50d5376d72b4b68d99c7e443891ed2032f20d530e",
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
      es: {
        dark: "c8fa9f36d6c7afa1d64d952615d713a273faacf64550d6ec260e9b552bf8a97c",
        light: "59d0cc4c746ce719aa6cbdb0166ef3cc3b5886d57fce2cf0e1730340f66faec7",
      },
      nl: {
        dark: "600ba701e2e38ac4a60a84b480803722a936f861186072d7d613f1ca2bd4d8bf",
        light: "d9851f79b964181d5493c88fcef43f224eb5d8784652624267d907e870578ee8",
      },
      pl: {
        dark: "9e23a7aee50bd21a7b24f6550f80cb54a974f28c37b0ac28151890414fc785e2",
        light: "a74252f2df7df806eba8c64ff4498ab4e7bae1fbc15c256ab56bad7dc827bf02",
      },
      pt: {
        dark: "b28a80048a282055d1c4a778cf65ce0537b7e189bd4c723ef99947e4236bb844",
        light: "5587ddd97620edc0bd0c6abfc9edb1077c064cf97b271f8305cc07b662d80445",
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
      es: {
        dark: "2e91ccd3288bc1aabb5afb8375538664dd2f9e9ec2f37a8fac721959a8d1bb5b",
        light: "67e5bab91573252912cbad96065f0b7f8ff42fc29c621e5b38a01dd41d63b6b4",
      },
      nl: {
        dark: "4efa03953aac13bfa6c2c1065cb77df6db26e7275681072a2d7f5ad3ca45cbd9",
        light: "52ed235163b293e0e8b07afdc76c708de994596a2e40446a411f4026ef2e46ee",
      },
      pl: {
        dark: "b291a9f8db24a515bf30ece4e5f7100fe24415611954dbbcd080f49185824d40",
        light: "e5b0c5d8ea0ee8feb29014a7e2bf4957015bb1eda3aefc842b92a15e5a078252",
      },
      pt: {
        dark: "26fae9c398adcff32a66967e78df38b3cb4ce4fc880895053bf9d4fbcbc57502",
        light: "14687ad86bda96dcb81a820fcd8cfba3251c78306b2140b5a739fefd6464a089",
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
      es: {
        dark: "56584444a01eab9a74db640c2b7b94730a71390b7bd5c4e3525bcc1d27b14926",
        light: "cb7b0d8b6039868db98ea1bf98623b2c98577c2c1edf56f9e9d31d7de742079b",
      },
      nl: {
        dark: "c6819e9adcb4efa35125cb597c7c88934eb1da0b2f71598f09d04d2aa1991798",
        light: "a3130bf3ffd7f55db4ce2cc8b2b2f329136783b58c7e2840a516ce01028cc109",
      },
      pl: {
        dark: "fb6902b74a1056f335acc14c3fd2d42e4255c2528be86e05da0312348b4f2efd",
        light: "a7a617533cc6ebbf834825ba2c4e2952cd6c25097929bdc54595b250b4e3110d",
      },
      pt: {
        dark: "71ddfc42a1e7fd731a57ac7b9a69b707d5a421104423f378deebb9d12809f042",
        light: "3386b2d7afa40705395ea9f640548b5fdeb39148cd0d76a1e6ba48c168e24632",
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
      es: {
        dark: "1a0ecc08858e6c1dd61f77e5dff81eee13dadd0ea023590db8475dcf7859d8e9",
        light: "1c1f2ee9f28e6859a78142f518578fa89b1e12aa7eb420d9f6c3a06ec41f45a0",
      },
      nl: {
        dark: "40816953faa4dec3383d81e3dcb2634e9543236fba289a690c928260ea0b6393",
        light: "99f8c383757d3c0a583e58b046ae9218155798c98c039b44a8a0a071d3d00d62",
      },
      pl: {
        dark: "a62c36537db3d24f352ee9ee764ec0e2ff7414b7485e0de42480b232625bd5f9",
        light: "9416bdf6e924a178da8182b948ec10c4114406a7d972180c9022d9ca3774528c",
      },
      pt: {
        dark: "7948f91b82559a7a9c32f6d7b8ffe3842e0f1896a8f320aec98aa2403c780025",
        light: "70ea0def87ffe40e5ae69950eaca6af867f2d396a22d88f88fbd8432062021e9",
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
      es: {
        dark: "2ce3cd42319fb57717ba77e063c24f9152cd446b9e189f987717d949671a7b10",
        light: "42372263ffeef033d534ec50da8ae48fca3380cd87d831e89028545bc0d9cdca",
      },
      nl: {
        dark: "1f4f0234c0ec81286400d5b221986dbe1718b72efaf8b67bf4fb2d474e81ad2a",
        light: "1808e3a3e7c41bbe703745278ce3f0808ad66c7864e67e0400b5a7cbbe965edb",
      },
      pl: {
        dark: "c3466cf20af1d2742259b530ae11b76d7c8600dfbf544f6b4ad3824b6c7b2122",
        light: "91b2ecb04d1164fec30bb5179229a7d5082b43b7a5df865c90e5fc6560cbaf3f",
      },
      pt: {
        dark: "5126b001ff899c7133f3fc6dc6789e7b57fae15f0cdeb2c5d8bfc6a355a56c01",
        light: "78de66857bb795ee6767d1081fc10058359e4a298eb6d1d1651f00abb328c6c6",
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
      es: {
        dark: "33f2260f46fc0637d89c477ec7d82607ce9f5af160eaae083c6eba5a304c41d1",
        light: "d388c2807b4d1a2de6d5f84efcc16c5a5964323354a3ddddaadbff2153a3ada7",
      },
      nl: {
        dark: "af65b2622f6d1750e605aaa7f9533166d3c45c13b1e7b97f0fa098d474f48dbd",
        light: "6eb04086cd50506bc5c329771d6fd0efd61fd7c688f188562e46a98c01f24837",
      },
      pl: {
        dark: "7452576aa1b19a11114ee07372f3af560cf11b80aa788dbc83ab73d2ef2df21a",
        light: "6492fc51c76bb8046b3b4d8a8217313ab4ad5b7c702023982dc8408b7afaad3a",
      },
      pt: {
        dark: "17a478f42f183d17f3d1902c8be8d9d1851c776421e321c01f0b5e28238fce35",
        light: "9b9bbdbcfdac1336ec4827e0b1cbdf447168d6916fade84a6c12e8691007c9a4",
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
      es: {
        dark: "881265a687a25c8feafdc183b57e1e6b5382ab29ba80270b0451b3d4a92cf137",
        light: "8ab8646ad70beb5719e9902216d54021714dd0d9537bc207b098d47999c9bdd5",
      },
      nl: {
        dark: "f0dff6c7b8aac97adad6ac5d0074f5b4374b99a7bd8006a90a88d28271e7e9d8",
        light: "1d002b91eb6028eb6c7469257e1da5b7a4d69d321219338ad09e9dc1a8e83b79",
      },
      pl: {
        dark: "b8b0595d40229ab5aea7986cf2031fbde331ea0001a3fc0806c7ecd371a4e6cf",
        light: "2841bd851dd7a4a5da2aeeb3740afdd1a94d854eaf613a83a53dd69adfce7b2a",
      },
      pt: {
        dark: "e538e27be45e6e7a2310eb05a87625fec38998ca58e069106833b6eaefbe010b",
        light: "f1e4778768ef9fbfd6e1e1bdbb226b67d3e4fbac980f3c728d55b3c896a3fbab",
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
      es: {
        dark: "3182db253cb7f4f39ee8563c5b17d5dc1248fde6064102461e78be38eded93b9",
        light: "2b3da86ec1e0e7d630b76df0cfec6b7f6aab818fc26e50b407840a493ad8ea2a",
      },
      nl: {
        dark: "db385a42b51068d3f7abe9431571f2f955fc89374edd4c2ccfea573ea6e8e123",
        light: "29aba05d37ab333c405fc0a6fe73ed3b062d850b453550c5d92861b9c7de68bc",
      },
      pl: {
        dark: "b2a6a32803fa1ce4f71e27a64deba8d159c5115157cc96537264d6f6036433de",
        light: "9b900609189e215be6e0388395da4539ae52e1a1982e5403dc3f2f45ca52b6f2",
      },
      pt: {
        dark: "6bf31cf7a3eaed85b6b4794d9d6d77921051bf147517b043c428090d17235b67",
        light: "2a21dd289c4487d390812e1973a19acda27d49cddc7560dd61dcc802a191f498",
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
      es: {
        dark: "e79a8f99774b4ef1c75b85b04d60e2d3f3aad043efde4f7fc0fa4069bbdcdfcf",
        light: "c1b5336abec5d63bc99b348fb48e445ccb60bc147851814693a9261f674bf303",
      },
      nl: {
        dark: "3ef8472904602e43b061ed281de2cde08ed672ef2604cea631bc28a5803dc11b",
        light: "47c677a25b70b24480a3a1e62742d7cad8d6800b7c18bcb8b2c2105d4210cc68",
      },
      pl: {
        dark: "ce8105a53f23f4dd8d415e1ed30d60a7b14fb5e5084fbf37c05868f6424db68d",
        light: "aa616d985d77f82e9a41d6baa7a73e202c4343b2b52187ae8a8057fcce21b3d2",
      },
      pt: {
        dark: "5c917d6e6a263ee771f31e666fc0ddb41d98ac6c9b17fcd3335397942bacd3b5",
        light: "f697440b40d245f52bb6897b0bd47b2591ce5e2258387b3819741ce0c13ffbea",
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
      es: {
        dark: "615f49fe1b67c26ff90339aa1e8e075fb65d722a9f17bdca652c5f019aa2f858",
        light: "5ee12a941d0c68af30798e03f3d8106e3c098dca3754318911239456f94d2792",
      },
      nl: {
        dark: "112752e2ece782c68730a364502cbf3c4e41ae02d08c419be5e610b60ef5dcec",
        light: "1b8d30bd14fc84a64409fea3b7c21d13d2f27ad66ed8e137686e62e6209cbdb8",
      },
      pl: {
        dark: "28489726b0e3a06885b6b3e87598dabfb635310128c2c8231f692d523bd51138",
        light: "9c2230a6c59c63a8f1da28541f2e05a3eb0cffc232930260c0322a85f0ff2fed",
      },
      pt: {
        dark: "7086fb6c3b6aff6fa91576a87ea2b3469238e6078c36bcf6d4c7ce19878c25e0",
        light: "7e2e52f2839151fe4984e85b624c00e35b97c74c85a2bee03ad02d0ebd2f39e2",
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
      es: {
        dark: "3cd2c9b081e29cb5670a4be67a3f831af8eadbc873651cb7f7379cc45ad711a5",
        light: "0516c9b2b46c5af47c4e0f2c8ac5ca653dc1cca6d4bed349a6a0fc197812f92f",
      },
      nl: {
        dark: "e6426313f98951c24c6c78e2a5f3278ab28890a7e9a18043e18a8be978a1d645",
        light: "8c060ab1a8b03280a17b3feb1db7ca77be4917da8b8befa3590fbb121b6d20cb",
      },
      pl: {
        dark: "3731d84060490c92a73682356b7957f4fcf6ff1064fe251d01b409e19e8ea433",
        light: "f4826c2ebbf77f9e549d6ccdcd4040aca926686d4721371cf588123fe9532b06",
      },
      pt: {
        dark: "adfd1d4b5cf92ed1542c07531286a13563d0dcb7624ce6fc9993a67a5889fc68",
        light: "26ea2b32f32821183e918496e9a00490c6440318eead49726012df2029d6c886",
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
      es: {
        dark: "4e31fe3916162cfb7117fcf15a9237a7edf8017ee7ac1b932a3d867b499aa303",
        light: "badd183dac3f893d2b694246c04858af3b68bf9cb4c987bea85913fc432e6a49",
      },
      nl: {
        dark: "2f5b3890a07074a8a1b9b667d6296edbd433af6b8271b656ab908c1ef4fbd7f3",
        light: "9f8050c9162a5aa0089a09b91b968373a67c91da49d644ea0eba3d6ff1c93f6c",
      },
      pl: {
        dark: "c23d8c1ce0d42cf97319cdde9eddc4e212a2d8d56edef86d5fe061b7a8a302a1",
        light: "2b032156fa34c28ab0cad9c36800a7b7dba71b59a3f8dfa7c88a8ba1c2d14b92",
      },
      pt: {
        dark: "8015e2628066c25935ded399edec628570f867c51099dfd3477048c390725b53",
        light: "e0df167c690f9a606b0c92ca03dc48eaccb6d545d75384ab2a4040272cae84f6",
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
      es: {
        dark: "8171216603accb07fdb0d8562d21283b31199f143a6672a52ddf9f7ad28537f0",
        light: "bfdcd2cced4bfc2e96f11644a21cd721ce78e90ec8fec42cce41873a0c9a8051",
      },
      nl: {
        dark: "0c586b05d05e4875a9a2b1372cc76096b46b8cfd28893c915a8ec55042df081e",
        light: "a488323ccf1c1babaaee0441e0917302dc40168b22f4c0bf07549e45f56bca0b",
      },
      pl: {
        dark: "f09f68d2edc481862af08a6a32427915b2a3f558df80473a3761d8e9b8b1da16",
        light: "38ff9541c846c3b90b050e71d5c2b77998a5a6f40967afd83977c968be2bd546",
      },
      pt: {
        dark: "04c2ebdd9b2a0f5e0d103753a1e1eabc812a2131ced57540ae2c4ee00331e5e1",
        light: "ba53c38899043395531cac67c5e2bda9229864840e6da146a5a772b14e73cbb9",
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
      es: {
        dark: "a3c126d3c6a5c51d5def72553a1b0636a9374f8a23015512b7e0cf801a2af1d7",
        light: "cf12928778872373f1a3ea8e89ae6a687c800285af5c40d0480b2bff2e333cfb",
      },
      nl: {
        dark: "ab678ec391e6e1a62ff3db5916ef14fc9aa48c1b948420890fc4e8ba83370ae5",
        light: "61452284742159de6a1b3aa3ea0d7c317fbddfcb5644a9ef553149278d629678",
      },
      pl: {
        dark: "ba490ec05c1c350ce5baf3d1a4b74e0ab9049c164094e3d3728a436deadcc7d5",
        light: "d96d09b211b78fec726fa1584ee2e08394f9cfb44fb345aaf4647c260840f30b",
      },
      pt: {
        dark: "8a7519e371bafabc132c126424363679e8f654ed4a176fcaa1ccac2f116b8b1d",
        light: "b2e6da86fadbf49cf63fc60093340afe2f7f50943c907d8e196a865469848ebe",
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
      es: {
        dark: "1c1fcabcce4bdcff74e2cad4b0cb03b6a90b49a46fff043aa343e0624e4e48e9",
        light: "e76ec6d940d99f44e7cbe02b27e1790fbcd2b8e8bf981bd3f56267dd9b2894f9",
      },
      nl: {
        dark: "29e661853578bb3463f6260bb0a6433b40b6b21a01239a9e8b613f5547401773",
        light: "6d0cbb91cfb004099798a92fc37e628002f8ea5d7a51512a05e882a31aacb7d2",
      },
      pl: {
        dark: "62855b0cf82a83fcbdc95c26158e437e1b7eaa99c98c87f4e05cf09e78540f7e",
        light: "7a8860df6a96624d3acecaa0af4911601c4cce9f9aeacb60c76c82ed7ccf1f33",
      },
      pt: {
        dark: "0d556ff95291a34d716d821c5fad33538d39f44d0ae6c370c32e40c8c1c01ac4",
        light: "b1b7866861df9f6bd6deddeac7fea0edc88a04a1674d6c3c7150a6f434ae5876",
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
      es: {
        dark: "99ad1d4f7f0035c67ac02532326ee8cd473e58163749d8c39f7d93a9633ee3a1",
        light: "df1917db8acc0b90b14a26a31e50d3c9fa4db5910c580acaf7300734dae78fa3",
      },
      nl: {
        dark: "eeae2014fab6a003c2e5b4defb95281fec720f48477023fab09c813981ac0d95",
        light: "e26ba250ca4b77a5a278bcbeef049815ab36be6150d4b391d96f124af5f57b99",
      },
      pl: {
        dark: "a36ebb5f5bfdc98351b1d12079edf2da13c25de797f6d8f50ea50238bfbb9872",
        light: "b0846e2c4454ff0772cf13327352a53bd481a94104bc820a98a1ac940cc8c8db",
      },
      pt: {
        dark: "9b7d8189610557758c3187097e3b3929192284c0aca0da8025614df5b8aca036",
        light: "4cb420dcffa03be936b9d98d6dbdf940b6988dc47c18181008b7444cf6d9cc1e",
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
      es: {
        dark: "17c20cded50881136fc2de6987b52e982c7a5990625feb3e82bfddead9fccc24",
        light: "31942c7a9df5b60c66c6f0d022ec8fb24c9558f277409796977eb2012554c85f",
      },
      nl: {
        dark: "1fe86d431f7ee011a38e088ad07b9860edaf4f7f83b4646e53dc422321e3da12",
        light: "ab5e87243e996c60fcfd4419ee1617feba680e36026da4ca31a4145935ef3a83",
      },
      pl: {
        dark: "62fa723c166ec64e7a4b07d2ca83d68881d3feea65a8a6804a7e927f95490b7d",
        light: "94b2ce2a7efa63a6b7c27ac582bbc8fd13a74fb20976fbb47a136eb82f580ac8",
      },
      pt: {
        dark: "6d23124767d33d03f856dc2fe574d138af56e59a5a15363829a1d89d9c4f4981",
        light: "7903c5a7eb9b098b6a634c64b5870afaa9e1e82cd0bdb92040e3a9f4ac0731a6",
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
      es: {
        dark: "9d923c71bef9e54cf65ae3c4a01cc7ab13631682d3dcbde2a2e1c464bd07bd04",
        light: "8eceab9b52adf5fdba339df2b40080d1efa96807ac3ee74f620ee9d1a0525481",
      },
      nl: {
        dark: "7f8a79cbbc02c06646a374dd694af49131a9903145195ba4c5740b5ed806a960",
        light: "c040d004b5a57e2fb8d8e3bc2dedcbd1b156200cbb1d34066732a7647104368e",
      },
      pl: {
        dark: "298c68bc203bb348ead31deba6b9091df840ecf8d453dbb3d6c719af66c668ab",
        light: "d15d61f8180564ed357959c7f16530bebb961d381ed9428dfc4fef3f15b28793",
      },
      pt: {
        dark: "0f4cbf905078d28e3009eb7cb81f32a9eeeb3a42161923f6a57c801d36fd9bf6",
        light: "046720bbbfbf0908218b6846336db7a1cea1a01491b4fbbb703a16d87a0a5740",
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
      es: {
        dark: "f5e373199ed3deacab93de687b44cdfba3425b116005583f189aa26750872c0a",
        light: "be7d5b265eb2be2af22403dae1600ca07f16cc72641d59c69db30f3a6027594a",
      },
      nl: {
        dark: "47ecb16b447d838539cbaa18540cf0e51d399bcfc7d2041b9d2cdeb09da9d67c",
        light: "b2b7c9b778f3f71577cc3f71145d52c9721d7fd3ddceb38371897e7ba7a1f912",
      },
      pl: {
        dark: "d51a8efb36934134acea2a3e66bbab646dfe901741517bb8868f9b98fa6ca079",
        light: "d29760c71fa5ac4e3c4de8ed11bfc50a8249321857ec881d987addedcb469498",
      },
      pt: {
        dark: "5f405c7104252d9c427a4795f254b7b71ee9d96e6abdfb079a7819ca952fa6b3",
        light: "a1dff2ead8ac36b006fa060fae5a9ea4eb8ea0713000e35ebfcbdb236069d0ca",
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
      es: {
        dark: "e29d30661e9fae91f5bee15c1bf8173f2e6bf7e52cd81647ca91d1bf1a6b585a",
        light: "f972c20bb5aeb9f9e2bba2b572cd7735e05f59fbb3952fa8272bb8aaf23040d0",
      },
      nl: {
        dark: "66f661e0766be7d7aefa466c67948418c226afceac29709141b66e6b5efba23a",
        light: "3806e60fe4f28f9c3084dfe2ee80744cb37b71198bf2b470ef4d7329efaf66b4",
      },
      pl: {
        dark: "d4b0a977f7e94f675b09efe3521e1a5b9589d7a8bd7cc3d4121101362931a84b",
        light: "549f906194ee8d86b98da642fa7846b7e0bd7116e7b302925a67b08bd436fbf9",
      },
      pt: {
        dark: "8779b44ac5d684ca5284666f67c5a3b90921d46877c08ba0b1283a9cfef8ae59",
        light: "19cbdf56575be33dd9a376501641742e1fec2aa15c1f8e377dab09dd39cc60d9",
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
      es: {
        dark: "5f86c89c187ce3ab28b49690032dc279c0721de6f422b031878019ef572f7b38",
        light: "3ffd88a5024cde73026ce54a65604e061d36d4ffef2b0539aefcf8f7f5d3adee",
      },
      nl: {
        dark: "98337eae6486a99237e8f13e50546517b6cf89cf79a8ed78e73d692dda71d2c9",
        light: "6b11cb97e266f0fd16d5b3f460a6af82019ac1807c4c022ae637db52ecd40859",
      },
      pl: {
        dark: "ffc9bf0558f17beba90beb527f8eb7db8548eb92168a02d6b1eea90d23d3a95d",
        light: "0adde614c8e3219b8223b603486598f16ce5d55c355f413b843233f45e4c125a",
      },
      pt: {
        dark: "22e20fe63878ff82e7d673a7857163bea42ebf301b74e3c604415df4909e39dd",
        light: "ce95a89a2a1bc1c20ac97ad29963b18a4f26bb0c747bdc74d433543df59da2bc",
      },
    },
    viewport: { height: 844, width: 390 },
  },
};
