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

export const maxCustomCoworkerTitles = 3;
export const maxCustomCoworkerTitleLength = 24;
export const maxCustomCoworkerIconLength = 4;

export type CoworkerTitleDisplay = {
  key: string;
  label: string;
  icon: string;
  isCustom: boolean;
  titleKey?: CoworkerTitle;
  customTitle?: string;
  customIcon?: string;
};

export type CoworkerTitleRecord = {
  id?: string;
  title?: CoworkerTitle | null;
  title_key?: CoworkerTitle | string | null;
  custom_title?: string | null;
  custom_icon?: string | null;
  is_custom?: boolean | null;
};

export function isCoworkerTitle(value: string): value is CoworkerTitle {
  return coworkerTitleValues.includes(value as CoworkerTitle);
}

export function presetCoworkerTitleDisplay(title: CoworkerTitle): CoworkerTitleDisplay {
  return {
    key: `preset:${title}`,
    label: coworkerTitleDetails[title].label,
    icon: coworkerTitleDetails[title].icon,
    isCustom: false,
    titleKey: title
  };
}

export function customCoworkerTitleDisplay(title: string, icon: string, id?: string): CoworkerTitleDisplay {
  const trimmedTitle = title.trim();
  const trimmedIcon = icon.trim();

  return {
    key: id ? `custom:${id}` : `custom:${trimmedTitle.toLowerCase()}:${trimmedIcon}`,
    label: trimmedTitle,
    icon: trimmedIcon,
    isCustom: true,
    customTitle: trimmedTitle,
    customIcon: trimmedIcon
  };
}

export function coworkerTitleDisplayFromRecord(record: CoworkerTitleRecord): CoworkerTitleDisplay | null {
  if (record.is_custom) {
    const customTitle = record.custom_title?.trim();
    const customIcon = record.custom_icon?.trim();

    if (!customTitle || !customIcon) {
      return null;
    }

    return customCoworkerTitleDisplay(customTitle, customIcon, record.id);
  }

  const title = record.title_key || record.title;

  if (!title || !isCoworkerTitle(title)) {
    return null;
  }

  return presetCoworkerTitleDisplay(title);
}
