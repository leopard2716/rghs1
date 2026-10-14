import type { ApplicationRules, EligibilityResult } from "../../services/tracking.service";
export type BatchedEligibility = {
  rules: ApplicationRules;
  results: EligibilityResult[];
  failedIds: string[];
};
export async function loadEligibilityBatches(
  ids: string[],
  load: (ids: string[]) => Promise<{ rules: ApplicationRules; results: EligibilityResult[] }>,
  publish: (data: BatchedEligibility) => void,
  signal: AbortSignal
): Promise<BatchedEligibility> {
  let data: BatchedEligibility = {
    rules: { cooldownDays: 45, timeZone: "America/Chicago" },
    results: [],
    failedIds: []
  };
  for (let offset = 0; offset < ids.length; offset += 20) {
    signal.throwIfAborted();
    const batch = ids.slice(offset, offset + 20);
    try {
      const response = await load(batch);
      data = { ...data, rules: response.rules, results: [...data.results, ...response.results] };
    } catch (error) {
      if (signal.aborted) throw error;
      data = { ...data, failedIds: [...data.failedIds, ...batch] };
    }
    signal.throwIfAborted();
    publish(data);
  }
  return data;
}
