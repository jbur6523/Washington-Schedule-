import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, localDate, type EtimeForm } from "./model";
import { layoutRows } from "./layout";
export const PDF_BUCKET = "etime-trial-private";
export const TEMPLATE = "templates/approved-v1.pdf";
export function timeText(value?: string) {
  return value ?? "";
}
const hoursFields: Record<string, string> = {
  vacation: "eto_vacation_hours",
  sick: "eto_sick_hours",
  bereavement: "bereavement_hours",
  education: "paid_education_hours",
  jury: "jury_duty_hours",
  holiday: "holiday_hours",
  other: "other_hours",
};
export async function renderForm(
  form: EtimeForm,
  templateBytes: Uint8Array,
  signatureBytes: Uint8Array,
) {
  const output = await PDFDocument.create();
  const entries = layoutRows(form.state.entries);
  for (let offset = 0; offset < Math.max(entries.length, 1); offset += 10) {
    const doc = await PDFDocument.load(templateBytes);
    doc.registerFontkit(fontkit);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const cursive = await doc.embedFont(signatureBytes);
    const fields = doc.getForm();
    const signatures: { value: string; x: number; y: number; size: number }[] =
      [];
    const fill = (
      name: string,
      value: string,
      size = 10,
      signature = false,
    ) => {
      const field = fields.getTextField(name);
      const font = signature ? cursive : regular;
      if (name.includes("signature") || name === "employee_name") {
        const width = field.acroField.getWidgets()[0].getRectangle().width - 4;
        size = Math.min(
          size,
          width / Math.max(font.widthOfTextAtSize(value, 1), 1),
        );
      }
      if (signature) {
        const rect = field.acroField.getWidgets()[0].getRectangle();
        signatures.push({ value, x: rect.x + 2, y: rect.y + 3, size });
        value = "";
      }
      field.acroField.setDefaultAppearance(`/Helvetica ${size} Tf 0 g`);
      field.setText(value);
      field.setFontSize(size);
      field.updateAppearances(font);
    };
    fill("pay_period_end_date", addDays(form.period_start, 13), 12);
    fill("employee_id", form.state.identity.employee_id, 12);
    fill(
      "employee_name",
      `${form.state.identity.first_name} ${form.state.identity.last_name}`,
      12,
    );
    fill(
      "employee_signature",
      form.state.employeeSignature?.name ?? "",
      18,
      true,
    );
    fill(
      "manager_signature",
      form.state.managerSignature?.name ?? "",
      18,
      true,
    );
    const entered = entries
      .flatMap((e) => (e.entered ? [e.entered.at] : []))
      .sort();
    fill(
      "date_reviewed",
      form.state.managerSignature
        ? localDate(new Date(form.state.managerSignature.at))
        : entered.length
          ? localDate(new Date(entered.at(-1)!))
          : "",
      12,
    );
    entries.slice(offset, offset + 10).forEach((e, index: number) => {
      const prefix = `row_${String(index + 1).padStart(2, "0")}_`;
      if (e.continuation) {
        fill(prefix + "reason", `Continued from preceding entry:\n${e.reason}`);
        return;
      }
      fill(
        prefix + "date",
        e.date.slice(5).replace("-", "/") + "/" + e.date.slice(2, 4),
      );
      for (const key of [
        "clock_in",
        "lunch_out",
        "lunch_in",
        "clock_out",
      ] as const)
        fill(prefix + key, timeText(e[key]));
      for (const key of [
        "department_cost_center",
        "job_code_transfer",
      ] as const)
        fill(prefix + key, e[key] ?? "");
      if (hoursFields[e.category])
        fill(prefix + hoursFields[e.category], e.hours ?? "");
      fill(prefix + "reason", e.reason);
      fill(prefix + "entered_initials", e.entered?.initials ?? "");
    });
    // The approved editable template stays private and unchanged; issued outputs are static revision records.
    fields.flatten();
    const page = doc.getPage(0);
    for (const signature of signatures)
      page.drawText(signature.value, {
        x: signature.x,
        y: signature.y,
        size: signature.size,
        font: cursive,
        color: rgb(0, 0, 0),
      });
    page.drawText(
      `TRIAL ONLY | Revision ${form.revision} | Page ${offset / 10 + 1}/${Math.max(1, Math.ceil(entries.length / 10))}`,
      { x: 14, y: 4, size: 8, font: regular, color: rgb(0.5, 0.1, 0.1) },
    );
    const [copied] = await output.copyPages(doc, [0]);
    output.addPage(copied);
  }
  output.setTitle("eTime Exception Form — Trial");
  return output.save();
}
export async function formPdf(form: EtimeForm) {
  const storage = createAdminClient().storage.from(PDF_BUCKET);
  const key = `forms/${form.id}/revision-${form.revision}.pdf`;
  const existing = await storage.download(key);
  if (existing.data) return new Uint8Array(await existing.data.arrayBuffer());
  const { data, error } = await createAdminClient()
    .from("etime_trial_templates")
    .select("pdf_base64")
    .eq("id", "approved-v1")
    .single();
  if (error || !data)
    throw new Error(
      "The approved template is unavailable. Your exception data is saved; retry PDF generation later.",
    );
  const font = await readFile(
    path.join(process.cwd(), "public/fonts/Allura-Regular.ttf"),
  );
  const bytes = await renderForm(
    form,
    new Uint8Array(Buffer.from(data.pdf_base64, "base64")),
    font,
  );
  const uploaded = await storage.upload(key, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploaded.error) {
    const concurrent = await storage.download(key);
    if (concurrent.data)
      return new Uint8Array(await concurrent.data.arrayBuffer());
    throw new Error(
      "Your data is saved, but the PDF could not be archived. Please retry.",
    );
  }
  return bytes;
}
