export function timeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second"))
  };
}

function timezoneOffsetMs(date: Date, timeZone: string) {
  const parts = timeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

export function wallTimeToIso(
  dateValue: string,
  timeValue: string,
  timeZone = "America/Los_Angeles"
) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);

  if (
    !year
    || !month
    || !day
    || !Number.isInteger(hour)
    || !Number.isInteger(minute)
    || hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
  ) {
    return "";
  }

  const initial = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  if (
    initial.getUTCFullYear() !== year
    || initial.getUTCMonth() !== month - 1
    || initial.getUTCDate() !== day
  ) {
    return "";
  }

  const firstPass = new Date(
    initial.getTime() - timezoneOffsetMs(initial, timeZone)
  );
  const secondPass = new Date(
    initial.getTime() - timezoneOffsetMs(firstPass, timeZone)
  );
  const resolved = timeZoneParts(secondPass, timeZone);

  if (
    resolved.year !== year
    || resolved.month !== month
    || resolved.day !== day
    || resolved.hour !== hour
    || resolved.minute !== minute
  ) {
    // A nonexistent local time (for example, the skipped spring DST hour)
    // cannot be represented safely and must be corrected by the user.
    return "";
  }

  return secondPass.toISOString();
}
