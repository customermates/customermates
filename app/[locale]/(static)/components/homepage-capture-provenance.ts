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
        dark: "6273236364cc674b08b0d6c0f4b8529e6a8233f7d7cbdc6dce6f2c67a2464f5e",
        light: "9a15e1491a8ece97ab5f4e2da1c2cf6432f7ad4e17644d5917053f761f6180cc",
      },
      en: {
        dark: "49f9cf7037f825f5988c5c0b343be0128442ff4082787a37674f56e11aa75801",
        light: "ad3f76a9c10bcfce36bf99e142e464f58b1dd37c9419af7bfee7be620edb236a",
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
        dark: "aea95f6f27c0dd1faee2660b776ec84ef8b071b9bf9158c390018c09cb37f250",
        light: "3486cc6a4c86b42fb606752eab5f536fb4798df4081df2f5087f5d689a072527",
      },
      en: {
        dark: "1ecfff90a231f43dc22402511e5cc32dad540b85578bd28c51133a24f65d0797",
        light: "b0f281e8f1da4d149aed8031235e66759331e0ed398fe35a15ff299a2c5a707a",
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
        dark: "5145f5513b280ab4da3d5afda853fef335209619724402ebdec841b087304bf8",
        light: "a0aef5000dd25ceea84fda1d1b816cfea0ff0579aeb9e2a2743d8043e48a7498",
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
        dark: "01c1635fadae968bda74c488decb68ae4b4a2d1aca63edb7f9d26d27da3c8397",
        light: "8a3fafa466be578e6f135358abbe56492e6a972adb1980259a9c72f87cc4994e",
      },
      en: {
        dark: "19d9ea757f64ea5297141f668944c337547f2bc7a1185240a5e24a62d56520a4",
        light: "f434ba4265adfb9c3fccc8c68435d1a865cc17ecd036bdf3cdd13be30088809e",
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
        dark: "7f4791d12c2f2c626955475ef63f24b5df290af5e3211f0ee6299c7c872e5f82",
        light: "42224d747f637d854e1c810ccfb90a28efba8dfc87da3bf118955b7ffb5824f0",
      },
      en: {
        dark: "f6b736de7888660da1dc4cf5911c39045a429da8a0f3cb84aff4aaea8a6796cd",
        light: "39bf60cb990bcbe0c92719b00116a9831ed3306f28b772f57cf8ad56bea2eab7",
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
        dark: "f1acaab5fb2d66c538b021d36c2e39d679fb9626089fc22e735083a666d7bb44",
        light: "9e8e54b90d55b6b0e75b44b3f4443016e2bc2e4d3a6a88ac759925791de9e10c",
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
        dark: "b9daf8be721f333bf55e752117231df40bc6ae4e7f8ab5cb706a875a691d9d77",
        light: "106d0140206978f1bc5f5f5f18859d9a7ad6249fda2cb3005748d76be0fec6bf",
      },
      en: {
        dark: "07b08c6739ca36843953a09d22079656f8f4363b7944879a9ffaca355c2d1466",
        light: "ebcf7a6520ed616351bb5bdb9839c3c6793241106e01d38665bdfb06231bec36",
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
        dark: "c62aaff779d4b04028b3c7bbc0f2dc8bd37d16cd68b093f224a5be1b952cdb0e",
        light: "a346dfdfd6ba1ab74ef5a0584f48b180345632d4c9b33d7a6a1a4f6f855877fe",
      },
      en: {
        dark: "11c7942875b79db7d81c42a1c7d15f99a6af3db1cc163fd6ace4b8b83a9e558b",
        light: "b54d488cccd4251bb0252d036f49ac8a1575bf17e658f4784cd7c962ab716f88",
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
        dark: "7814e860902bb174051f5299c416aeaa62505f6f4c98f4e4cb6bc5e558e69837",
        light: "cb529281c7c1fb5c7e0ad889f3fe33297e8fd7f1006047900a95c4d8f2a1c340",
      },
      en: {
        dark: "7f5510df06f6715c2faf06d4ac8eaa971e4d9372b1d6500e35aa94093c9164b8",
        light: "3a1a6fec0a7b5797e34fbe48da256790f9d17fd5d392e91399dc0be2d13e1b07",
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
        dark: "4be9fe93bdfa1fa66d43c86495a382990b908c1df3ecd9bd43ae3fde706c3290",
        light: "96d145515355bb7e510b625335c50a7dc966c6fcb3ece014e08ff33327d46ceb",
      },
      en: {
        dark: "ac2d5348bdc944705a06e297c6b52cc88ac5084ddf13d601bf08940e1ad5b0e6",
        light: "d04106ccda764cc9bf4e5927e561c5573373d85bbc78ec2496fd5f4ea843cbcc",
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
