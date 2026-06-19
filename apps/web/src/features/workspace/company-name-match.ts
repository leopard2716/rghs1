import type { BidRecord } from "../../services/tracking.service";

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

export function companyNameSimilarity(query: string, candidate: string): number {
  const normalizedQuery = normalizeCompanyName(query);
  const normalizedCandidate = normalizeCompanyName(candidate);
  if (normalizedQuery.length < 2 || !normalizedCandidate) {
    return 0;
  }

  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const compactCandidate = normalizedCandidate.replace(/\s+/g, "");
  if (compactQuery === compactCandidate) {
    return 1;
  }

  if (compactCandidate.startsWith(compactQuery)) {
    return 0.96;
  }

  if (compactQuery.startsWith(compactCandidate)) {
    return 0.92;
  }

  if (compactQuery.length < 4) {
    return 0;
  }

  const tokenScore = tokenSimilarity(normalizedQuery.split(" "), normalizedCandidate.split(" "));
  const characterScore = diceCoefficient(compactQuery, compactCandidate);
  const score = Math.max(tokenScore * 0.94, characterScore * 0.9);
  const threshold = compactQuery.length < 6 ? 0.62 : 0.54;

  return score >= threshold ? score : 0;
}

export function matchingCompanyBids(query: string, bids: BidRecord[], limit = 8): BidRecord[] {
  return bids
    .map((bid) => ({
      bid,
      score: companyNameSimilarity(query, bid.company)
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) => right.score - left.score || right.bid.bidAt.localeCompare(left.bid.bidAt)
    )
    .slice(0, limit)
    .map(({ bid }) => bid);
}

function endsWithTokens(tokens: string[], suffix: readonly string[]): boolean {
  if (suffix.length > tokens.length) {
    return false;
  }

  const offset = tokens.length - suffix.length;
  return suffix.every((token, index) => tokens[offset + index] === token);
}

function tokenSimilarity(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let overlap = 0;

  for (const token of leftSet) {
    if (
      rightSet.has(token) ||
      [...rightSet].some(
        (candidate) =>
          token.length >= 4 &&
          candidate.length >= 4 &&
          (candidate.startsWith(token) || token.startsWith(candidate))
      )
    ) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftSet.size, rightSet.size);
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) {
    return 1;
  }
  if (left.length < 2 || right.length < 2) {
    return 0;
  }

  const leftPairs = bigramCounts(left);
  const rightPairs = bigramCounts(right);
  let overlap = 0;

  for (const [pair, count] of leftPairs) {
    overlap += Math.min(count, rightPairs.get(pair) ?? 0);
  }

  return (2 * overlap) / (left.length - 1 + right.length - 1);
}

function bigramCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const pair = value.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}
