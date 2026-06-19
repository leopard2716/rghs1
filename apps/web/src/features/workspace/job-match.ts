import type { BidRecord } from "../../services/tracking.service";

export function matchingJobs(query: string, bids: BidRecord[], limit = 8): BidRecord[] {
  const queryTokens = normalizeSearchText(query).split(" ").filter(Boolean);
  const ranked = bids
    .map((bid) => ({
      bid,
      score: queryTokens.length
        ? jobMatchScore(queryTokens, `${bid.jobTitle} at ${bid.company}`)
        : 0.1
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) => right.score - left.score || right.bid.bidAt.localeCompare(left.bid.bidAt)
    );

  return ranked.slice(0, limit).map(({ bid }) => bid);
}

function jobMatchScore(queryTokens: string[], candidate: string): number {
  const candidateTokens = normalizeSearchText(candidate).split(" ").filter(Boolean);
  const scores = queryTokens.map((queryToken) =>
    Math.max(
      ...candidateTokens.map((candidateToken) => tokenMatchScore(queryToken, candidateToken))
    )
  );

  if (scores.some((score) => score === 0)) {
    return 0;
  }

  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function tokenMatchScore(query: string, candidate: string): number {
  if (query === candidate) {
    return 1;
  }
  if (candidate.startsWith(query)) {
    return 0.94;
  }
  if (query.length >= 3 && candidate.includes(query)) {
    return 0.82;
  }
  if (query.length < 4 || candidate.length < 4) {
    return 0;
  }

  const similarity = diceCoefficient(query, candidate);
  return similarity >= 0.58 ? similarity * 0.82 : 0;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function diceCoefficient(left: string, right: string): number {
  const leftPairs = pairs(left);
  const rightPairs = pairs(right);
  if (!leftPairs.length || !rightPairs.length) {
    return 0;
  }

  const remaining = [...rightPairs];
  let overlap = 0;
  for (const pair of leftPairs) {
    const index = remaining.indexOf(pair);
    if (index >= 0) {
      overlap += 1;
      remaining.splice(index, 1);
    }
  }

  return (2 * overlap) / (leftPairs.length + rightPairs.length);
}

function pairs(value: string): string[] {
  return Array.from({ length: Math.max(0, value.length - 1) }, (_, index) =>
    value.slice(index, index + 2)
  );
}
