export type ShiftStatusCountInput = {
  rtsOn: string;
  rvuCount: string;
  ventCount: string;
  bipapCount: string;
  cSectionCount: string;
  vaginalDeliveryCount: string;
  cabgCount: string;
  bronchCount: string;
  sputumInductionCount: string;
  otherProcedureCount: string;
};

const wholeNumberFields: Array<[keyof ShiftStatusCountInput, string, boolean]> = [
  ["rtsOn", "RTs Scheduled", true],
  ["ventCount", "Vents", false],
  ["bipapCount", "BiPAPs", true],
  ["cSectionCount", "C-Sections", false],
  ["vaginalDeliveryCount", "Vaginal Deliveries", false],
  ["cabgCount", "CABG", false],
  ["bronchCount", "Bronchs", false],
  ["sputumInductionCount", "Sputum Inductions", false],
  ["otherProcedureCount", "Other Procedures", false]
];

export function validateShiftStatusCounts(input: ShiftStatusCountInput) {
  for (const [field, label, required] of wholeNumberFields) {
    const value = input[field].trim();

    if (!value && !required) {
      continue;
    }

    const parsed = Number(value);
    if (!value || !Number.isInteger(parsed) || parsed < 0) {
      return `${label} must be a whole number of 0 or more.`;
    }
  }

  const rvuCount = Number(input.rvuCount);
  if (
    !input.rvuCount.trim()
    || !Number.isFinite(rvuCount)
    || rvuCount < 0
  ) {
    return "RVUs must be a number of 0 or more.";
  }

  return null;
}

export function rtsNeededFromRvus(value: string) {
  const rvuCount = Number(value);

  if (!value.trim() || !Number.isFinite(rvuCount) || rvuCount < 0) {
    return null;
  }

  return Math.round((rvuCount / 27) * 10) / 10;
}

export function shiftStatusNumberValue(value: string) {
  return value.trim() ? Number(value) : 0;
}

export function optionalShiftStatusNumberValue(value: string) {
  return value.trim() ? Number(value) : null;
}
