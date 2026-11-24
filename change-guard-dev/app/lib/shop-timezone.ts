const LOCAL_DATE_TIME_PATTERN = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})$/;

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

/**
 * Converts the value produced by an HTML datetime-local input into UTC
 * using the Shopify store's IANA timezone.
 *
 * datetime-local intentionally has no timezone information, so interpreting
 * it with the server's timezone would make scheduled promotions dependent on
 * where the app happens to be running.
 */
export function localDateTimeToUtcIso(
  value: string,
  timeZone: string,
): string {
  const match = value.match(LOCAL_DATE_TIME_PATTERN);

  if (!match) {
    throw new Error("Enter a valid date and time.");
  }

  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  let guess = target;

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const actual = zonedParts(new Date(guess), timeZone);
      const actualAsUtc = Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute,
      );

      const offset = actualAsUtc - guess;
      guess = target - offset;
    }
  } catch {
    throw new Error("The Shopify store timezone is invalid or unavailable.");
  }

  const result = new Date(guess);

  if (!Number.isFinite(result.getTime())) {
    throw new Error("The promotion date and time is invalid.");
  }

  return result.toISOString();
}

export function describeTimeZone(
  timeZone: string,
  abbreviation?: string,
): string {
  if (abbreviation) return `${timeZone} (${abbreviation})`;
  return timeZone;
}
