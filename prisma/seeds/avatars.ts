export const SYNTHETIC_AVATAR_ORIGIN = "https://customermates.com";

const SYNTHETIC_AVATAR_BASE_URL = `${SYNTHETIC_AVATAR_ORIGIN}/demo/avatars/photos`;

export const SYNTHETIC_CONTACT_AVATAR_URLS = [
  `${SYNTHETIC_AVATAR_BASE_URL}/leon-becker.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/tim-wagner.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/lucio-ball.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/mara-bauer.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/max-schmidt.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/sophie-hoffmann.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/jonas-weber.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/amin-hassan.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/lea-bauer.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/maxine-zoll.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/lina-alvarez.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/felix-koch.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/omar-khalil.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/tim-weber.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/leila-chen.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/mia-schneider.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/amir-haddad.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/sophie-wagner.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/reinhold-mertens.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/alexej-sofr.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/anna-mueller.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/yasmin-farouk.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/lukas-fischer.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/felix-schneider.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/rashid-malik.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/paul-koch.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/nia-johnson.png`,
  `${SYNTHETIC_AVATAR_BASE_URL}/paul-fischer.png`,
] as const;

/** The people on the approved contact photos, in photo order; marketing visuals show them under these names. */
export const DEMO_PHOTO_PEOPLE = [
  ["Leon", "Becker"],
  ["Tim", "Wagner"],
  ["Lucio", "Ball"],
  ["Mara", "Bauer"],
  ["Max", "Schmidt"],
  ["Sophie", "Hoffmann"],
  ["Jonas", "Weber"],
  ["Amin", "Hassan"],
  ["Lea", "Bauer"],
  ["Maxine", "Zoll"],
  ["Lina", "Alvarez"],
  ["Felix", "Koch"],
  ["Omar", "Khalil"],
  ["Tim", "Weber"],
  ["Leila", "Chen"],
  ["Mia", "Schneider"],
  ["Amir", "Haddad"],
  ["Sophie", "Wagner"],
  ["Reinhold", "Mertens"],
  ["Alexej", "Sofr"],
  ["Anna", "Müller"],
  ["Yasmin", "Farouk"],
  ["Lukas", "Fischer"],
  ["Felix", "Schneider"],
  ["Rashid", "Malik"],
  ["Paul", "Koch"],
  ["Nia", "Johnson"],
  ["Paul", "Fischer"],
] as const;

export const SYNTHETIC_AVATAR_URLS = {
  aminHassan: `${SYNTHETIC_AVATAR_BASE_URL}/amin-hassan.png`,
  annaMueller: `${SYNTHETIC_AVATAR_BASE_URL}/anna-mueller.png`,
  claraNeumann: `${SYNTHETIC_AVATAR_BASE_URL}/clara-neumann.png`,
  elenaHoffmann: `${SYNTHETIC_AVATAR_BASE_URL}/elena-hoffmann.png`,
  jonasWeber: `${SYNTHETIC_AVATAR_BASE_URL}/jonas-weber.png`,
  kianRahimi: `${SYNTHETIC_AVATAR_BASE_URL}/kian-rahimi.png`,
  lauraFischer: `${SYNTHETIC_AVATAR_BASE_URL}/laura-fischer.png`,
  leonBecker: `${SYNTHETIC_AVATAR_BASE_URL}/leon-becker.png`,
  marcoSilva: `${SYNTHETIC_AVATAR_BASE_URL}/marco-silva.png`,
  maxBergmann: `${SYNTHETIC_AVATAR_BASE_URL}/max-bergmann.png`,
  rashidMalik: `${SYNTHETIC_AVATAR_BASE_URL}/rashid-malik.png`,
  sofiaRossi: `${SYNTHETIC_AVATAR_BASE_URL}/sofia-rossi.png`,
  sophieWagner: `${SYNTHETIC_AVATAR_BASE_URL}/sophie-wagner.png`,
  yasminFarouk: `${SYNTHETIC_AVATAR_BASE_URL}/yasmin-farouk.png`,
} as const;

/** The approved contact photos by file name; demo records pick one whose first name fits the contact. */
export type DemoContactPhoto =
  | "leon-becker"
  | "tim-wagner"
  | "lucio-ball"
  | "mara-bauer"
  | "max-schmidt"
  | "sophie-hoffmann"
  | "jonas-weber"
  | "amin-hassan"
  | "lea-bauer"
  | "maxine-zoll"
  | "lina-alvarez"
  | "felix-koch"
  | "omar-khalil"
  | "tim-weber"
  | "leila-chen"
  | "mia-schneider"
  | "amir-haddad"
  | "sophie-wagner"
  | "reinhold-mertens"
  | "alexej-sofr"
  | "anna-mueller"
  | "yasmin-farouk"
  | "lukas-fischer"
  | "felix-schneider"
  | "rashid-malik"
  | "paul-koch"
  | "nia-johnson"
  | "paul-fischer";

export function demoContactPhoto(photo: DemoContactPhoto): string {
  return `${SYNTHETIC_AVATAR_BASE_URL}/${photo}.png`;
}
