import type { RecordAddress } from "@/features/records/record-model.schema";
import type { NorthwindOrganization } from "./northwind-data";

import { formatAddressStreet, unverifiedRecordAddress } from "@/features/records/record-address";

type Site = readonly [city: string, postalCode: string, region: string | null, lat: number, lon: number];

type Country = {
  sites: readonly Site[];
  streets: readonly string[];
  line2: string;
};

/**
 * Fictional office addresses of the demo organizations: a real city, one of its postal codes and a common street
 * name, but no checked building. They are typed in by hand, so the seed stores them unverified with the
 * approximate centre of their postal code, as the server stores a typed address once the country's postal codes
 * are loaded; the map widget places them there.
 */
const COUNTRIES: Record<string, Country> = {
  de: {
    sites: [
      ["Hamburg", "20457", "Hamburg", 53.5413, 9.9911],
      ["München", "80339", "Bayern", 48.1335, 11.542],
      ["Köln", "50825", "Nordrhein-Westfalen", 50.9512, 6.9105],
      ["Frankfurt am Main", "60327", "Hessen", 50.1031, 8.6402],
      ["Stuttgart", "70565", "Baden-Württemberg", 48.7302, 9.1103],
      ["Leipzig", "04109", "Sachsen", 51.3397, 12.3731],
      ["Hannover", "30159", "Niedersachsen", 52.3759, 9.732],
      ["Düsseldorf", "40221", "Nordrhein-Westfalen", 51.2102, 6.7503],
      ["Nürnberg", "90429", "Bayern", 49.4497, 11.0598],
      ["Bremen", "28217", "Bremen", 53.0903, 8.7802],
      ["Dresden", "01099", "Sachsen", 51.0702, 13.7598],
      ["Mannheim", "68169", "Baden-Württemberg", 49.5003, 8.4702],
      ["Dortmund", "44147", "Nordrhein-Westfalen", 51.5201, 7.4502],
      ["Bonn", "53111", "Nordrhein-Westfalen", 50.7374, 7.0982],
      ["Kiel", "24103", "Schleswig-Holstein", 54.3233, 10.1228],
      ["Magdeburg", "39104", "Sachsen-Anhalt", 52.1205, 11.6276],
      ["Berlin", "10969", "Berlin", 52.505, 13.395],
      ["Karlsruhe", "76131", "Baden-Württemberg", 49.0102, 8.4203],
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
      ["Wien", "1030", "Wien", 48.199, 16.395],
      ["Graz", "8020", "Steiermark", 47.0702, 15.4202],
      ["Linz", "4020", "Oberösterreich", 48.2903, 14.2902],
      ["Salzburg", "5020", "Salzburg", 47.8003, 13.0402],
      ["Innsbruck", "6020", "Tirol", 47.2692, 11.4041],
    ],
    streets: ["Industriestraße", "Bahnhofstraße", "Gewerbestraße", "Hafenstraße"],
    line2: "Stiege 2",
  },
  ch: {
    sites: [
      ["Zürich", "8005", "Zürich", 47.3901, 8.5203],
      ["Basel", "4057", "Basel-Stadt", 47.5702, 7.6002],
      ["Bern", "3011", "Bern", 46.948, 7.4474],
      ["Luzern", "6003", "Luzern", 47.0502, 8.3003],
    ],
    streets: ["Industriestrasse", "Bahnhofstrasse", "Hardstrasse", "Gewerbestrasse"],
    line2: "Gebäude 2",
  },
  nl: {
    sites: [
      ["Rotterdam", "3013 AK", "Zuid-Holland", 51.9244, 4.4777],
      ["Utrecht", "3521 AZ", "Utrecht", 52.0902, 5.1103],
      ["Eindhoven", "5611 AZ", "Noord-Brabant", 51.4402, 5.4703],
    ],
    streets: ["Industrieweg", "Havenstraat", "Kanaalweg", "Stationsweg"],
    line2: "Unit 4",
  },
  gb: {
    sites: [
      ["Manchester", "M4 6DE", null, 53.484, -2.229],
      ["Leeds", "LS11 5QN", null, 53.7802, -1.5503],
      ["Bristol", "BS1 6QH", null, 51.4502, -2.5903],
      ["Birmingham", "B5 4UA", null, 52.4702, -1.8903],
      ["Edinburgh", "EH6 6QQ", null, 55.9702, -3.1703],
    ],
    streets: ["Station Road", "Mill Lane", "Canal Street", "Park Road", "Dock Road"],
    line2: "Unit 4",
  },
  ie: {
    sites: [
      ["Dublin", "D02 X285", null, 53.3402, -6.2603],
      ["Cork", "T12 RX4E", null, 51.9002, -8.4703],
      ["Galway", "H91 E2K7", null, 53.2702, -9.0503],
    ],
    streets: ["Station Road", "Mill Street", "Dock Road"],
    line2: "Unit 4",
  },
  se: {
    sites: [
      ["Göteborg", "411 05", "Västra Götalands län", 57.7089, 11.9746],
      ["Stockholm", "111 64", "Stockholms län", 59.3302, 18.0603],
      ["Malmö", "211 20", "Skåne län", 55.605, 13.0038],
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
  const [city, postalCode, region, lat, lon] = hinted ?? country.sites[(organization.index * 7) % country.sites.length];
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
  return { ...address, location: { lat, lon, precision: "postcode" } };
}
