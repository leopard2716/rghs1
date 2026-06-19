import { deviceTimeZone, supportedTimeZones } from "./datetime";

export type TimeZoneSearchResult = {
  id: string;
  city: string;
  friendlyName: string | null;
  offset: string;
  isDevice: boolean;
};

const TIME_ZONE_ALIASES: Record<string, string[]> = {
  UTC: ["universal time", "coordinated universal time", "gmt"],
  "America/New_York": ["new york", "eastern", "eastern time", "us eastern", "et", "est", "edt"],
  "America/Chicago": ["chicago", "central", "central time", "us central", "ct", "cst", "cdt"],
  "America/Denver": ["denver", "mountain", "mountain time", "us mountain", "mt", "mst", "mdt"],
  "America/Phoenix": ["phoenix", "arizona", "mst"],
  "America/Los_Angeles": [
    "los angeles",
    "california",
    "pacific",
    "pacific time",
    "us pacific",
    "pt",
    "pst",
    "pdt"
  ],
  "America/Anchorage": ["anchorage", "alaska", "alaska time", "akst", "akdt"],
  "Pacific/Honolulu": ["honolulu", "hawaii", "hawaii time", "hst"],
  "Asia/Manila": ["manila", "philippines", "philippine time", "pht"],
  "Asia/Tokyo": ["tokyo", "japan", "japan time", "jst"],
  "Europe/London": ["london", "united kingdom", "uk", "british time", "gmt", "bst"]
};

const FRIENDLY_NAMES: Record<string, string> = {
  UTC: "Coordinated Universal Time",
  "America/New_York": "Eastern Time",
  "America/Chicago": "Central Time",
  "America/Denver": "Mountain Time",
  "America/Phoenix": "Arizona Time",
  "America/Los_Angeles": "Pacific Time",
  "America/Anchorage": "Alaska Time",
  "Pacific/Honolulu": "Hawaii Time",
  "Asia/Manila": "Philippine Time",
  "Asia/Tokyo": "Japan Time",
  "Europe/London": "United Kingdom Time"
};

export function searchTimeZones(
  query: string,
  zones = supportedTimeZones(),
  limit = 12,
  date = new Date()
): TimeZoneSearchResult[] {
  const normalizedQuery = normalize(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const currentZone = deviceTimeZone();

  return zones
    .map((zone) => {
      const aliases = TIME_ZONE_ALIASES[zone] ?? [];
      const offset = timeZoneOffset(zone, date);
      const searchableValues = [
        zone,
        zone.replaceAll("_", " ").replaceAll("/", " "),
        cityName(zone),
        FRIENDLY_NAMES[zone] ?? "",
        offset,
        ...aliases
      ].map(normalize);
      const score = queryTokens.length
        ? timeZoneScore(normalizedQuery, queryTokens, searchableValues)
        : zone === currentZone
          ? 1
          : 0.1;

      return {
        result: {
          id: zone,
          city: cityName(zone),
          friendlyName: FRIENDLY_NAMES[zone] ?? null,
          offset,
          isDevice: zone === currentZone
        },
        score
      };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.result.isDevice) - Number(left.result.isDevice) ||
        left.result.id.localeCompare(right.result.id)
    )
    .slice(0, limit)
    .map(({ result }) => result);
}

export function timeZoneInputLabel(zone: string, date = new Date()): string {
  const friendlyName = FRIENDLY_NAMES[zone];
  const location = cityName(zone);
  const name = friendlyName ? `${location} - ${friendlyName}` : location;
  return `${name} (${timeZoneOffset(zone, date)})`;
}

function timeZoneScore(normalizedQuery: string, queryTokens: string[], values: string[]): number {
  if (values.includes(normalizedQuery)) {
    return 1;
  }
  if (values.some((value) => value.startsWith(normalizedQuery))) {
    return 0.95;
  }

  const allTokensMatch = queryTokens.every((token) =>
    values.some((value) => value.split(" ").some((candidate) => candidate.startsWith(token)))
  );
  return allTokensMatch ? 0.82 : 0;
}

function cityName(zone: string): string {
  if (zone === "UTC") {
    return "UTC";
  }

  return (zone.split("/").at(-1) ?? zone).replaceAll("_", " ");
}

function timeZoneOffset(zone: string, date: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en", {
      timeZone: zone,
      timeZoneName: "shortOffset"
    })
      .formatToParts(date)
      .find((item) => item.type === "timeZoneName")?.value;
    return part?.replace("GMT", "UTC") ?? "UTC";
  } catch {
    return "UTC";
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
