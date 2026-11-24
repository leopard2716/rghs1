const LEGAL_SUFFIXES = [
  ["limited", "liability", "company"],
  ["public", "limited", "company"],
  ["private", "limited", "company"],
  ["l", "l", "c"],
  ["l", "l", "p"],
  ["p", "l", "c"],
  ["s", "a"],
  ["a", "g"],
  ["incorporated"],
  ["incorporation"],
  ["corporation"],
  ["company"],
  ["limited"],
  ["llc"],
  ["llp"],
  ["plc"],
  ["corp"],
  ["inc"],
  ["ltd"],
  ["gmbh"],
  ["pte"],
  ["pvt"],
  ["sas"],
  ["sa"],
  ["ag"],
  ["bv"],
  ["nv"],
  ["oy"],
  ["ab"],
  ["as"],
  ["pc"],
  ["co"]
] as const;

export function normalizeCompanyName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const originalTokens = normalized.split(/\s+/);
  const tokens =
    originalTokens[0] === "the" && originalTokens.length > 1
      ? originalTokens.slice(1)
      : [...originalTokens];

  let removedSuffix = true;
  while (tokens.length > 1 && removedSuffix) {
    removedSuffix = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (endsWithTokens(tokens, suffix) && tokens.length > suffix.length) {
        tokens.splice(tokens.length - suffix.length, suffix.length);
        removedSuffix = true;
        break;
      }
    }
  }

  return tokens.join(" ");
}

function endsWithTokens(tokens: string[], suffix: readonly string[]): boolean {
  if (suffix.length > tokens.length) {
    return false;
  }

  const offset = tokens.length - suffix.length;
  return suffix.every((token, index) => tokens[offset + index] === token);
}

export function isUnknownCompanyName(value: string | null | undefined): boolean {
  const name = (value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  return name === "" || name === "unknown" || name === "unknown company";
}

// Keep persisted normalization keys stable. Identity comparisons additionally ignore spacing
// and allow an otherwise identical brand with a trailing business descriptor.
const BUSINESS_DESCRIPTORS = [
  "healthcare",
  "health",
  "technologies",
  "technology",
  "holdings",
  "group"
];
const GENERIC_BRANDS = new Set([
  ...BUSINESS_DESCRIPTORS,
  "care",
  "services",
  "solutions",
  "systems",
  "global",
  "international"
]);

function shorterCompanyBrands(compact: string): string[] {
  const brands: string[] = [];
  let candidate = compact;
  for (;;) {
    const suffix = BUSINESS_DESCRIPTORS.find((value) => candidate.endsWith(value));
    if (!suffix) return brands;
    candidate = candidate.slice(0, -suffix.length);
    if (candidate.length < 4) return brands;
    if (!GENERIC_BRANDS.has(candidate)) brands.push(candidate);
  }
}

export function companyNamesMatch(left: string, right: string): boolean {
  if (isUnknownCompanyName(left) || isUnknownCompanyName(right)) return false;
  const a = normalizeCompanyName(left).replace(/\s+/g, "");
  const b = normalizeCompanyName(right).replace(/\s+/g, "");
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length < b.length
    ? shorterCompanyBrands(b).includes(a)
    : shorterCompanyBrands(a).includes(b);
}

// Use directional keys so "Acme Health" and "Acme Group" both match "Acme",
// without matching each other. Reset keys also cover custom company cooldowns.
export function companyEligibilityKeys(company: string, side: "cached" | "changed"): string[] {
  const keys = ["reset:" + companyResetKey(company)];
  const name = normalizeCompanyName(company).replace(/\s+/g, "");
  if (!name || isUnknownCompanyName(company)) return keys;
  keys.push("name:" + name);
  if (side === "changed") keys.push("longer:" + name);
  for (const brand of shorterCompanyBrands(name)) {
    keys.push((side === "cached" ? "longer:" : "name:") + brand);
  }
  return keys;
}

export function companyResetKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/( (inc|incorporated|llc|corp|corporation|co|company|limited|ltd))+$/, "")
    .replace(/ /g, "");
}
export type CompanyReset = { company: string; days: number };
