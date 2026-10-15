export const TRIAL_NOTICE =
  "Trial only — submissions are temporary and are not official payroll records. Official records will start fresh after go-live.";
export const categories = {
  punches: "Missed IN / OUT",
  lunch: "Missed Lunch",
  transfer: "Department / Job Transfer",
  vacation: "ETO Vacation",
  sick: "ETO Sick",
  bereavement: "Bereavement",
  education: "Paid Education Leave",
  jury: "Jury Duty",
  holiday: "Holiday",
  other: "Other Hours",
} as const;
export type Category = keyof typeof categories;
export function formatClockInput(value: string, complete = false) {
  const cleaned = value.replace(/[^0-9:]/g, "");
  if (complete && /^\d{3}$/.test(cleaned)) return `0${cleaned[0]}:${cleaned.slice(1)}`;
  if (cleaned.includes(":")) {
    const [h, m = ""] = cleaned.split(":");
    return `${h.length === 1 && m ? "0" + h : h.slice(0, 2)}:${m.slice(0, 2)}`;
  }
  const digits = cleaned.slice(0, 4);
  return digits.length > 2
    ? `${digits.slice(0, 2)}:${digits.slice(2)}`
    : digits;
}
export type Entry = {
  id: string;
  date: string;
  category: Category;
  clock_in?: string;
  clock_out?: string;
  lunch_out?: string;
  lunch_in?: string;
  department_cost_center?: string;
  job_code_transfer?: string;
  hours?: string;
  reason: string;
  revision: number;
  entered?: { initials: string; actor: string; at: string; revision: number };
};
export type Signature = {
  name: string;
  actor: string;
  at: string;
  contentRevision: number;
};
export type Identity = {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  department_id: string;
  auth_user_id?: string | null;
};
export type FormState = {
  identity: Pick<Identity, "employee_id" | "first_name" | "last_name">;
  entries: Entry[];
  contentRevision: number;
  employeeSignature?: Signature;
  managerSignature?: Signature;
};
export type EtimeForm = {
  id: string;
  identity_id: string;
  department_id: string;
  period_start: string;
  revision: number;
  state: FormState;
  updated_at: string;
};
export function localDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function periodStart(date: string) {
  const days = Math.floor(
    (Date.parse(date + "T12:00:00Z") - Date.parse("2026-10-11T12:00:00Z")) /
      86400000,
  );
  return addDays("2026-10-11", Math.floor(days / 14) * 14);
}
export function periodOpen(start: string, now = new Date()) {
  const today = localDate(now);
  return today >= start && today <= addDays(start, 16);
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function requireText(value: unknown, label: string, max = 60) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new Error(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export function employeeId(value: unknown) {
  const id = requireText(value, "Employee ID", 20);
  if (!/^\d+$/.test(id))
    throw new Error("Employee ID must contain digits only.");
  return id;
}
export function validateEntry(
  raw: Record<string, unknown>,
  now = new Date(),
): Omit<Entry, "id" | "revision"> {
  if (
    !validDate(raw.date) ||
    raw.date > localDate(now) ||
    !periodOpen(periodStart(raw.date), now)
  )
    throw new Error(
      "Choose a date in an open pay period, no later than today.",
    );
  const category = raw.category as Category;
  if (!Object.hasOwn(categories, category))
    throw new Error("Choose an exception type.");
  const result: Omit<Entry, "id" | "revision"> = {
    date: raw.date,
    category,
    reason: requireText(raw.reason, "Reason", 90),
  };
  if (category === "punches" || category === "lunch") {
    const fields =
      category === "lunch"
        ? (["lunch_out", "lunch_in"] as const)
        : (["clock_in", "clock_out"] as const);
    for (const field of fields)
      if (raw[field]) {
        if (
          typeof raw[field] !== "string" ||
          !/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(raw[field] as string)
        )
          throw new Error(
            "Enter a 24-hour time from 00:00 to 23:59, or 24:00 for midnight.",
          );
        result[field] = raw[field] as string;
      }
    if (!fields.some((field) => result[field]))
      throw new Error("Enter at least one missing punch.");
  } else if (category === "transfer") {
    for (const field of [
      "department_cost_center",
      "job_code_transfer",
    ] as const)
      if (raw[field]) result[field] = requireText(raw[field], "Transfer", 14);
    if (!result.department_cost_center && !result.job_code_transfer)
      throw new Error("Enter a department or job code transfer.");
  } else {
    if (
      typeof raw.hours !== "string" ||
      !/^\d{1,2}(\.\d{1,2})?$/.test(raw.hours) ||
      +raw.hours <= 0 ||
      +raw.hours > 24
    )
      throw new Error(
        "Enter exact hours greater than 0 and up to 24 (up to two decimal places).",
      );
    result.hours = raw.hours;
  }
  return result;
}
export function signedName(value: unknown, expected: string, adopted: unknown) {
  const name = requireText(value, "Full signature name", 100);
  if (
    adopted !== true ||
    name.toLocaleLowerCase().replace(/\s+/g, " ") !==
      expected.toLocaleLowerCase().replace(/\s+/g, " ")
  )
    throw new Error("Type your full official name and confirm your signature.");
  return name;
}
