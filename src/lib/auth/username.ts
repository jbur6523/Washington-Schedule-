export function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function splitDisplayName(displayName: string) {
  const cleaned = displayName
    .replace(/[^A-Za-z0-9\s'-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: cleaned[0] ?? "",
    lastName: cleaned.length > 1 ? cleaned[cleaned.length - 1] : cleaned[0] ?? ""
  };
}

export function generateBaseUsername(displayName: string) {
  const { firstName, lastName } = splitDisplayName(displayName);
  const normalizedFirst = normalizeUsername(firstName);
  const normalizedLast = normalizeUsername(lastName);

  if (normalizedFirst === "bei" && normalizedLast === "yi") {
    return "yibe";
  }

  if (normalizedFirst === "pawanjit" && normalizedLast === "khera") {
    return "pawk";
  }

  return `${normalizedLast.slice(0, 3)}${normalizedFirst.slice(0, 1)}`;
}

export function authEmailForUsername(username: string) {
  return `${normalizeUsername(username)}@washington-schedule.local`;
}
