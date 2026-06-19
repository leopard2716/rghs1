import { localDateValue, zonedDateTimeToIso } from "../../utils/datetime";

export type DashboardRangePreset = "today" | "week" | "month" | "year" | "custom";

export function dashboardDateRange(
  preset: DashboardRangePreset,
  timeZone: string,
  customFrom: string,
  customTo: string,
  now = new Date()
) {
  const today = localDateValue(now);
  let fromDate = today;
  let toDateExclusive = shiftDate(today, 1);

  if (preset === "week") {
    const day = dayOfWeek(today);
    fromDate = shiftDate(today, -(day === 0 ? 6 : day - 1));
    toDateExclusive = shiftDate(fromDate, 7);
  } else if (preset === "month") {
    fromDate = `${today.slice(0, 8)}01`;
    toDateExclusive = nextMonth(fromDate);
  } else if (preset === "year") {
    fromDate = `${today.slice(0, 4)}-01-01`;
    toDateExclusive = `${Number(today.slice(0, 4)) + 1}-01-01`;
  } else if (preset === "custom") {
    fromDate = customFrom;
    toDateExclusive = shiftDate(customTo, 1);
  }

  const from = zonedDateTimeToIso(fromDate, "00:00", timeZone);
  const to = zonedDateTimeToIso(toDateExclusive, "00:00", timeZone);
  const todayFrom = zonedDateTimeToIso(today, "00:00", timeZone);
  const todayTo = zonedDateTimeToIso(shiftDate(today, 1), "00:00", timeZone);
  if (!from || !to || !todayFrom || !todayTo) {
    throw new Error("The dashboard date range could not be resolved.");
  }

  return {
    from,
    to,
    todayFrom,
    todayTo,
    fromDate,
    toDateExclusive
  };
}

export function datesInRange(fromDate: string, toDateExclusive: string): string[] {
  const dates: string[] = [];
  for (let current = fromDate; current < toDateExclusive; current = shiftDate(current, 1)) {
    dates.push(current);
  }
  return dates;
}

function dayOfWeek(value: string): number {
  return new Date(`${value}T00:00:00Z`).getUTCDay();
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextMonth(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}
