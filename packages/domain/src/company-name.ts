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
