import styles from "@/components/ShiftStatusPrintLayout.module.css";

export type ShiftStatusPrintData = {
  shiftDate: string;
  shiftType: "day" | "night";
  updatedByName: string;
  rtsOnShift: string;
  rtsNeeded: string;
  rvuTotal: string;
  vents: string;
  bipaps: string;
  cSections: string;
  vaginalDeliveries: string;
  cabg: string;
  bronchs: string;
  sputumInductions: string;
  mri: string;
  otherProcedures: string;
  shiftNotes: string;
};

type ShiftStatusPrintLayoutProps = {
  data: ShiftStatusPrintData;
};

export function formatShiftStatusPrintDate(shiftDate: string) {
  const [year = "", month = "", day = ""] = shiftDate.split("-");

  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return shiftDate || "Not selected";
  }

  return `${month}/${day}/${year}`;
}

function printableValue(value: string, fallback = "-") {
  return value.trim() || fallback;
}

function procedureValue(value: string) {
  return value.trim() || "0";
}

export function ShiftStatusPrintLayout({ data }: ShiftStatusPrintLayoutProps) {
  const currentCounts = [
    { label: "RTs On Shift", value: printableValue(data.rtsOnShift) },
    { label: "RTs Needed", value: printableValue(data.rtsNeeded) },
    { label: "RVUs", value: printableValue(data.rvuTotal) },
    { label: "Vents", value: printableValue(data.vents) },
    { label: "BiPAPs", value: printableValue(data.bipaps) }
  ];
  const procedures = [
    { label: "C-Sections", value: procedureValue(data.cSections) },
    { label: "Vaginal Deliveries", value: procedureValue(data.vaginalDeliveries) },
    { label: "CABG", value: procedureValue(data.cabg) },
    { label: "Bronchs", value: procedureValue(data.bronchs) },
    { label: "Sputum Inductions", value: procedureValue(data.sputumInductions) },
    { label: "MRI", value: procedureValue(data.mri) }
  ];

  return (
    <article
      className={styles.print}
      data-testid="shift-status-print-layout"
      aria-hidden="true"
    >
      <header className={styles.header}>
        <p>WHHS RT SCHEDULE</p>
        <h1>Shift Status Report</h1>
        <div className={styles.shiftMeta}>
          <span>{formatShiftStatusPrintDate(data.shiftDate)}</span>
          <span aria-hidden="true">•</span>
          <span>{data.shiftType === "day" ? "Day Shift" : "Night Shift"}</span>
        </div>
        <p className={styles.updatedBy}>
          Updated by: <strong>{printableValue(data.updatedByName, "Not entered")}</strong>
        </p>
      </header>

      <section className={styles.section}>
        <h2>1. Current Counts</h2>
        <div className={styles.currentCounts}>
          {currentCounts.map((count, index) => (
            <div
              key={count.label}
              className={index < 3 ? styles.primaryCount : styles.secondaryCount}
            >
              <span>{count.label}</span>
              <strong>{count.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>2. Scheduled Procedures</h2>
        <div className={styles.procedures}>
          {procedures.map((procedure) => (
            <div key={procedure.label}>
              <span>{procedure.label}</span>
              <strong>{procedure.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>3. Other Procedures</h2>
        <div className={styles.textBox}>{printableValue(data.otherProcedures, "None")}</div>
      </section>

      <section className={styles.section}>
        <h2>4. Shift Notes</h2>
        <div className={`${styles.textBox} ${styles.notes}`}>
          {printableValue(data.shiftNotes, "None")}
        </div>
      </section>
    </article>
  );
}
