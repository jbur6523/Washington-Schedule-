import type { PhoneListRowDefinition, PhoneListSectionKey } from "@/lib/phone-list/types";

type SectionDefinition = {
  key: PhoneListSectionKey;
  label: string;
  rows: Array<{ key: string; label: string }>;
};

const sections: SectionDefinition[] = [
  {
    key: "main_hospital",
    label: "Main Hospital",
    rows: [
      { key: "main_lead_therapist", label: "Lead Therapist" },
      { key: "main_rapid_response", label: "Rapid Response" },
      { key: "main_ijr", label: "IJR" },
      { key: "main_special_care_nursery", label: "Special Care Nursery" },
      { key: "main_2w_2s", label: "2W/2S" },
      { key: "main_pediatrics_2north", label: "Pediatrics 2North" },
      { key: "main_3n_3e", label: "3N/3E" },
      { key: "main_3_west", label: "3 WEST" },
      { key: "main_4_west", label: "4 WEST" },
      { key: "main_5w", label: "5W" },
      { key: "main_6w", label: "6W" },
      { key: "main_ekg", label: "EKG" },
      { key: "main_abg", label: "ABG" },
      { key: "main_or_pacu_cath_lab", label: "OR/PACU/Cath Lab" },
      { key: "main_bronch", label: "BRONCH" }
    ]
  },
  {
    key: "morris_hyman_pavilion",
    label: "Morris Hyman Pavilion",
    rows: [
      { key: "mhp_rapid_response", label: "RAPID RESPONSE" },
      { key: "mhp_er", label: "ER" },
      { key: "mhp_abg", label: "MHP-ABG" },
      { key: "mhp_ekg", label: "MHP-EKG" },
      { key: "mhp_ccu_rt_resource", label: "CCU-RT RESOURCE" },
      { key: "mhp_ccu_a_imc", label: "CCU-A IMC" },
      { key: "mhp_ccu_b_imc", label: "CCU-B IMC" },
      { key: "mhp_ccu_b", label: "CCU-B" },
      { key: "mhp_ccu_c", label: "CCU-C" },
      { key: "mhp_ccu_d", label: "CCU-D" },
      { key: "mhp_ccu_e", label: "CCU-E" },
      { key: "mhp_3_oncology", label: "3-ONCOLOGY" },
      { key: "mhp_3_telemetry", label: "3-TELEMETRY" }
    ]
  },
  {
    key: "additional_staff",
    label: "Additional Staff",
    rows: [
      { key: "additional_staff_1", label: "ADDITIONAL STAFF" },
      { key: "additional_staff_2", label: "ADDITIONAL STAFF" },
      { key: "additional_staff_3", label: "ADDITIONAL STAFF" }
    ]
  }
];

export const phoneListRows: PhoneListRowDefinition[] = sections.flatMap((section, sectionIndex) =>
  section.rows.map((row, rowIndex) => ({
    ...row,
    sectionKey: section.key,
    sectionLabel: section.label,
    displayOrder:
      sections.slice(0, sectionIndex).reduce((total, previous) => total + previous.rows.length, 0) + rowIndex + 1
  }))
);

export const phoneListSections = sections.map((section) => ({
  key: section.key,
  label: section.label,
  rows: phoneListRows.filter((row) => row.sectionKey === section.key)
}));
