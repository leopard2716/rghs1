export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function paginationFor(total: number, page: number, pageSize: number): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page: Math.min(page, totalPages),
    pageSize,
    total,
    totalPages
  };
}

export function normalizeSearch(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

export function matchesJobSearch(
  record: { company: string; jobTitle: string },
  search: string
): boolean {
  if (!search) {
    return true;
  }

  const haystack = `${record.company} ${record.jobTitle}`.toLocaleLowerCase();
  return search.split(/\s+/).every((token) => haystack.includes(token));
}

export function sortJobRecords<
  T extends {
    company: string;
    jobTitle: string;
  }
>(
  records: T[],
  sortBy: "company" | "jobTitle" | "datetime",
  sortDirection: "asc" | "desc",
  dateValue: (record: T) => string
): T[] {
  const direction = sortDirection === "asc" ? 1 : -1;
  return [...records].sort((left, right) => {
    if (sortBy === "datetime") {
      return dateValue(left).localeCompare(dateValue(right)) * direction;
    }

    return (
      left[sortBy].localeCompare(right[sortBy], undefined, {
        sensitivity: "base"
      }) * direction
    );
  });
}

export function paginate<T>(
  records: T[],
  page: number,
  pageSize: number
): { records: T[]; pagination: Pagination } {
  const total = records.length;
  const pagination = paginationFor(total, page, pageSize);
  const normalizedPage = pagination.page;
  const offset = (normalizedPage - 1) * pageSize;

  return {
    records: records.slice(offset, offset + pageSize),
    pagination
  };
}

export function inDateRange(value: string, from: string, to: string): boolean {
  const timestamp = new Date(value).getTime();
  return timestamp >= new Date(from).getTime() && timestamp < new Date(to).getTime();
}

export function zonedDateKey(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function countBy<T>(
  records: T[],
  keyFor: (record: T) => { key: string; label: string } | null
) {
  const values = new Map<string, { key: string; label: string; value: number }>();
  for (const record of records) {
    const group = keyFor(record);
    if (!group) {
      continue;
    }
    const current = values.get(group.key);
    values.set(group.key, {
      ...group,
      value: (current?.value ?? 0) + 1
    });
  }

  return [...values.values()].sort(
    (left, right) => right.value - left.value || left.label.localeCompare(right.label)
  );
}

export function trendByDate<T>(records: T[], timeZone: string, dateFor: (record: T) => string) {
  const values = new Map<string, number>();
  for (const record of records) {
    const key = zonedDateKey(dateFor(record), timeZone);
    values.set(key, (values.get(key) ?? 0) + 1);
  }

  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, value }));
}
