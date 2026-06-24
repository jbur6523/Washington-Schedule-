export const coworkerTitleValues = [
  "bestie",
  "work_wife",
  "work_husband",
  "ride_or_die",
  "emotional_support_coworker",
  "frenemy",
  "trauma_bonded"
] as const;

export type CoworkerTitle = (typeof coworkerTitleValues)[number];

export const coworkerTitleDetails: Record<CoworkerTitle, { label: string; icon: string }> = {
  bestie: { label: "Bestie", icon: "✨" },
  work_wife: { label: "Work Wife", icon: "💍" },
  work_husband: { label: "Work Husband", icon: "💅" },
  ride_or_die: { label: "Ride or Die", icon: "🚗" },
  emotional_support_coworker: { label: "Emotional Support Coworker", icon: "🧸" },
  frenemy: { label: "Frenemy", icon: "👀" },
  trauma_bonded: { label: "Trauma Bonded", icon: "🚑" }
};

export function isCoworkerTitle(value: string): value is CoworkerTitle {
  return coworkerTitleValues.includes(value as CoworkerTitle);
}
