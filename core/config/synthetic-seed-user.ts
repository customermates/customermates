export const SYNTHETIC_COMPANY_USERS = {
  maxBergmann: {
    email: "max.bergmann@customermates.com",
    firstName: "Max",
    lastName: "Bergmann",
    name: "Max Bergmann",
  },
  sofiaRossi: {
    email: "sofia.rossi@customermates.com",
    firstName: "Sofia",
    lastName: "Rossi",
    name: "Sofia Rossi",
  },
  elenaHoffmann: {
    email: "elena.hoffmann@customermates.com",
    firstName: "Elena",
    lastName: "Hoffmann",
    name: "Elena Hoffmann",
  },
} as const;

export const SYNTHETIC_SHARED_USER_PASSWORD = "local-demo-password";

export const SYNTHETIC_SEED_USER = {
  email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
  password: SYNTHETIC_SHARED_USER_PASSWORD,
} as const;
