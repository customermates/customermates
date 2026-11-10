export const SYNTHETIC_AVATAR_ORIGIN = "https://customermates.com";

const SYNTHETIC_AVATAR_BASE_URL = `${SYNTHETIC_AVATAR_ORIGIN}/demo/avatars/people`;

/** One photo per demo person, `public/demo/avatars/people/<name>.jpg`, the same in every data locale. */
const avatarUrl = (name: string) => `${SYNTHETIC_AVATAR_BASE_URL}/${name}.jpg`;

/** The photo of a contact: `<solution id>--<contact record key>`. */
export const contactAvatarUrl = (solutionId: string, contactKey: string) => avatarUrl(`${solutionId}--${contactKey}`);

/** The photo of a colleague of a non-team workspace: `team--<solution id>-<colleague key>`. */
export const colleagueAvatarUrl = (solutionId: string, colleagueKey: string) =>
  avatarUrl(`team--${solutionId}-${colleagueKey}`);

/** The photos of the seven members of the team workspace: `team--<member slug>`. */
export const SYNTHETIC_AVATAR_URLS = {
  claraNeumann: avatarUrl("team--clara-neumann"),
  elenaHoffmann: avatarUrl("team--elena-hoffmann"),
  kianRahimi: avatarUrl("team--kian-rahimi"),
  lauraFischer: avatarUrl("team--laura-fischer"),
  marcoSilva: avatarUrl("team--marco-silva"),
  maxBergmann: avatarUrl("team--max-bergmann"),
  sofiaRossi: avatarUrl("team--sofia-rossi"),
} as const;
