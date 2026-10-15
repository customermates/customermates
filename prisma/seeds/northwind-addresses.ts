import type { RecordAddress } from "@/features/records/record-model.schema";
import type { NorthwindOrganization } from "./northwind-data";

import { formatAddressStreet, unverifiedRecordAddress } from "@/features/records/record-address";

type Site = readonly [city: string, postalCode: string, region: string | null];

type Country = {
  sites: readonly Site[];
  streets: readonly string[];
  line2: string;
};

/**
 * Fictional office addresses of the demo organizations: a real city, one of its postal codes and a common street
 * name, but no checked building. They are typed in by hand, so the seed stores them unverified, without
 * coordinates, exactly as the server stores a manually entered address.
 */
const COUNTRIES: Record<string, Country> = {
  de: {
    sites: [
      ["Hamburg", "20457", "Hamburg"],
      ["München", "80339", "Bayern"],
      ["Köln", "50825", "Nordrhein-Westfalen"],
      ["Frankfurt am Main", "60327", "Hessen"],
      ["Stuttgart", "70565", "Baden-Württemberg"],
      ["Leipzig", "04109", "Sachsen"],
      ["Hannover", "30159", "Niedersachsen"],
      ["Düsseldorf", "40221", "Nordrhein-Westfalen"],
      ["Nürnberg", "90429", "Bayern"],
      ["Bremen", "28217", "Bremen"],
      ["Dresden", "01099", "Sachsen"],
      ["Mannheim", "68169", "Baden-Württemberg"],
      ["Dortmund", "44147", "Nordrhein-Westfalen"],
      ["Bonn", "53111", "Nordrhein-Westfalen"],
      ["Kiel", "24103", "Schleswig-Holstein"],
      ["Magdeburg", "39104", "Sachsen-Anhalt"],
      ["Berlin", "10969", "Berlin"],
      ["Karlsruhe", "76131", "Baden-Württemberg"],
    ],
    streets: [
      "Industriestraße",
      "Hafenstraße",
      "Gewerbestraße",
      "Bahnhofstraße",
      "Lindenstraße",
      "Gutenbergstraße",
      "Robert-Bosch-Straße",
      "Werkstraße",
      "Max-Planck-Straße",
      "Siemensstraße",
    ],
    line2: "Gebäude B",
  },
  at: {
    sites: [
      ["Wien", "1030", "Wien"],
      ["Graz", "8020", "Steiermark"],
      ["Linz", "4020", "Oberösterreich"],
      ["Salzburg", "5020", "Salzburg"],
      ["Innsbruck", "6020", "Tirol"],
    ],
    streets: ["Industriestraße", "Bahnhofstraße", "Gewerbestraße", "Hafenstraße"],
    line2: "Stiege 2",
  },
  ch: {
    sites: [
      ["Zürich", "8005", "Zürich"],
      ["Basel", "4057", "Basel-Stadt"],
      ["Bern", "3011", "Bern"],
      ["Luzern", "6003", "Luzern"],
    ],
    streets: ["Industriestrasse", "Bahnhofstrasse", "Hardstrasse", "Gewerbestrasse"],
    line2: "Gebäude 2",
  },
  nl: {
    sites: [
      ["Rotterdam", "3013 AK", "Zuid-Holland"],
      ["Utrecht", "3521 AZ", "Utrecht"],
      ["Eindhoven", "5611 AZ", "Noord-Brabant"],
    ],
    streets: ["Industrieweg", "Havenstraat", "Kanaalweg", "Stationsweg"],
    line2: "Unit 4",
  },
  gb: {
    sites: [
      ["Manchester", "M4 6DE", null],
      ["Leeds", "LS11 5QN", null],
      ["Bristol", "BS1 6QH", null],
      ["Birmingham", "B5 4UA", null],
      ["Edinburgh", "EH6 6QQ", null],
    ],
    streets: ["Station Road", "Mill Lane", "Canal Street", "Park Road", "Dock Road"],
    line2: "Unit 4",
  },
  ie: {
    sites: [
      ["Dublin", "D02 X285", null],
      ["Cork", "T12 RX4E", null],
      ["Galway", "H91 E2K7", null],
    ],
    streets: ["Station Road", "Mill Street", "Dock Road"],
    line2: "Unit 4",
  },
  se: {
    sites: [
      ["Göteborg", "411 05", "Västra Götalands län"],
      ["Stockholm", "111 64", "Stockholms län"],
      ["Malmö", "211 20", "Skåne län"],
    ],
    streets: ["Industrigatan", "Hamngatan", "Storgatan"],
    line2: "Hus B",
  },
};

const STEM_COUNTRIES: Record<string, string> = {
  Brightwater: "gb",
  Harborline: "gb",
  Ironvale: "gb",
  Oakridge: "gb",
  Riverton: "gb",
  Talbrook: "gb",
  Westhaven: "gb",
  Greystone: "gb",
  Hollis: "gb",
  Lowell: "gb",
  Moorfield: "gb",
  Parkside: "gb",
  Redcliff: "gb",
  Thornbury: "gb",
  Calder: "gb",
  Eastmere: "gb",
  Fennick: "gb",
  Juniper: "gb",
  Larkspur: "gb",
  Northgate: "gb",
  Pemberton: "gb",
  Dunmore: "ie",
  Glenhaven: "ie",
  Ashgrove: "ie",
  Jansen: "nl",
  Corvus: "nl",
  Ivers: "nl",
  Lindqvist: "se",
  Sonnenhof: "at",
  Unterberg: "at",
  Saalbach: "at",
  Tannberg: "at",
  Valemont: "ch",
  Kaltenbach: "ch",
};

const STEM_CITIES: Record<string, string> = {
  Hansen: "Hamburg",
  Nordlicht: "Kiel",
  Altmark: "Magdeburg",
  Rheinfeld: "Köln",
  Elbtal: "Dresden",
  Isarwerk: "München",
  Drachenfels: "Bonn",
  Mainbrück: "Frankfurt am Main",
  Oderland: "Berlin",
  Wendland: "Hannover",
  Calder: "Edinburgh",
  Saalbach: "Salzburg",
};

/** The office address of a demo organization, derived from its name stem and index so every seed run agrees. */
export function northwindOrganizationAddress(organization: NorthwindOrganization): RecordAddress {
  const countryCode = STEM_COUNTRIES[organization.shortName] ?? "de";
  const country = COUNTRIES[countryCode];
  const hinted = country.sites.find(([city]) => city === STEM_CITIES[organization.shortName]);
  const [city, postalCode, region] = hinted ?? country.sites[(organization.index * 7) % country.sites.length];
  const road = country.streets[(organization.index * 3) % country.streets.length];
  const houseNumber = String(1 + ((organization.index * 37) % 140));
  const address = unverifiedRecordAddress({
    street: formatAddressStreet(road, houseNumber, countryCode),
    line2: organization.index % 7 === 3 ? country.line2 : null,
    postalCode,
    city,
    region,
    countryCode,
    formatted: "",
    location: null,
    verification: { status: "unverified", provider: null, checkedAt: null },
  });
  if (!address) throw new Error(`Northwind organization ${organization.index} has no address`);
  return address;
}
