export const shortDateTimeFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export function displayDate(value: string | null | undefined, fallback = "Not set"): string {
  if (!value) {
    return fallback;
  }

  return shortDateTimeFormat.format(new Date(value));
}

export function localDateTimeValue(date = new Date()): string {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 16);
}

export function localDateTimeToIso(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function supportedTimeZones(): string[] {
  const supportedValuesOf = (
    Intl as unknown as {
      supportedValuesOf?: (key: "timeZone") => string[];
    }
  ).supportedValuesOf;
  const deviceZone = deviceTimeZone();
  const zones = supportedValuesOf ? supportedValuesOf("timeZone") : [deviceZone, "UTC"];
  return [...new Set([deviceZone, "UTC", ...zones])];
}

export function localDateValue(date = new Date()): string {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

export function localTimeValue(date = new Date()): string {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(11, 16);
}

export function zonedDateTimeToIso(date: string, time: string, timeZone: string): string | null {
  const match = `${date}T${time}`.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !isTimeZone(timeZone)) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  const requested = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute)
  };
  const utcGuess = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute
  );
  let timestamp = utcGuess;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const rendered = zonedParts(new Date(timestamp), timeZone);
    const renderedAsUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute
    );
    timestamp += utcGuess - renderedAsUtc;
  }

  const result = new Date(timestamp);
  const rendered = zonedParts(result, timeZone);
  return sameDateTime(requested, rendered) ? result.toISOString() : null;
}

export function displayZonedDateTimeRange(
  startAt: string,
  endAt: string | null,
  timeZone: string | null
): string {
  if (!endAt || !timeZone || !isTimeZone(timeZone)) {
    return displayDate(startAt);
  }

  const start = new Date(startAt);
  const end = new Date(endAt);
  const date = new Intl.DateTimeFormat("en", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat("en", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  });
  return `${date}, ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
}

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function sameDateTime(
  left: ReturnType<typeof zonedParts>,
  right: ReturnType<typeof zonedParts>
): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

export const bidTimeZone = "America/Chicago";

export function centralDateTimeValue(date = new Date()): string {
  const parts = zonedParts(date, bidTimeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function centralDateTimeToIso(value: string): string | null {
  const [date, time] = value.split("T");
  return zonedDateTimeToIso(date ?? "", time ?? "", bidTimeZone);
}

export function displayCentralDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: bidTimeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

export function centralTimeZoneLabel(value: string): string {
  const iso = centralDateTimeToIso(value);
  if (!iso) return "Central Time (America/Chicago)";
  const date = new Date(iso);
  const zone = (style: "short" | "longOffset") =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: bidTimeZone,
      timeZoneName: style
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;
  return `${zone("short")} (${zone("longOffset")?.replace("GMT", "UTC")}) · America/Chicago`;
}

export function centralDayRange(date: string): { dateFrom: string; dateTo: string } {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const dateFrom = zonedDateTimeToIso(date, "00:00", bidTimeZone);
  const dateTo = zonedDateTimeToIso(next.toISOString().slice(0, 10), "00:00", bidTimeZone);
  if (!dateFrom || !dateTo) throw new Error("Invalid bid filter date.");
  return { dateFrom, dateTo };
}
