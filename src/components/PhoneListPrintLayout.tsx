import { phoneListSections } from "@/lib/phone-list/rows";
import type { PhoneListAssignment, PhoneListShiftType } from "@/lib/phone-list/types";
import styles from "@/components/PhoneListPrintLayout.module.css";

type PhoneListPrintLayoutProps = {
  scheduleDate: string;
  shiftType: PhoneListShiftType;
  assignments: PhoneListAssignment[];
};

export function formatPhoneListPrintDate(scheduleDate: string) {
  const [year = "", month = "", day = ""] = scheduleDate.split("-");

  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return scheduleDate;
  }

  return `${month}/${day}/${year}`;
}

export function PhoneListPrintLayout({
  scheduleDate,
  shiftType,
  assignments
}: PhoneListPrintLayoutProps) {
  const assignmentsByRowKey = new Map(
    assignments.map((assignment) => [assignment.rowKey, assignment])
  );
  const printableSections = phoneListSections.map((section) => ({
    ...section,
    rows: section.key === "additional_staff" ? section.rows.slice(0, 1) : section.rows
  }));

  return (
    <section
      className={styles.print}
      data-testid="phone-list-print-layout"
      aria-hidden="true"
    >
      <header className={styles.header}>
        <h1>RESPIRATORY CARE PHONE LIST</h1>
        <div className={styles.meta}>
          <span>DATE: {formatPhoneListPrintDate(scheduleDate)}</span>
          <span>{shiftType === "day" ? "DAY SHIFT" : "NIGHT SHIFT"}</span>
        </div>
      </header>

      <div className={styles.body}>
        {printableSections.map((section) => (
          <section key={section.key} className={styles.section}>
            <h2>{section.label}</h2>
            <div>
              {section.rows.map((row) => {
                const assignment = assignmentsByRowKey.get(row.key);

                return (
                  <div
                    key={row.key}
                    className={styles.row}
                    data-print-row-key={row.key}
                  >
                    <div className={styles.label}>{row.label}</div>
                    <div className={styles.value} data-print-field="staff-name">
                      {assignment?.staffNameSnapshot || "\u00a0"}
                    </div>
                    <div className={styles.value} data-print-field="phone-number">
                      {assignment?.phoneNumber || "\u00a0"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
