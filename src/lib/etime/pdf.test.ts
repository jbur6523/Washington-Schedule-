// @vitest-environment node
import { it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderForm } from "./pdf";
import type { EtimeForm } from "./model";
it.skipIf(!process.env.ETIME_TEMPLATE_PATH)(
  "renders the approved private template with cursive signatures and continuation pages",
  async () => {
    const template = await readFile(process.env.ETIME_TEMPLATE_PATH!);
    const font = await readFile("public/fonts/Allura-Regular.ttf");
    const fixture: EtimeForm = {
      id: "synthetic",
      identity_id: "synthetic",
      department_id: "synthetic",
      period_start: "2026-10-11",
      revision: 1,
      updated_at: "2026-10-15",
      state: {
        identity: {
          first_name: "Synthetic",
          last_name: "Employee",
          employee_id: "000000",
        },
        contentRevision: 1,
        employeeSignature: {
          name: "Synthetic Employee",
          actor: "test",
          at: "2026-10-15T18:00:00Z",
          contentRevision: 1,
        },
        managerSignature: {
          name: "Test Manager",
          actor: "test",
          at: "2026-10-15T18:00:00Z",
          contentRevision: 1,
        },
        entries: Array.from({ length: 11 }, (_, i) => ({
          id: String(i),
          date: "2026-10-15",
          category: "lunch",
          lunch_out: "12:00",
          lunch_in: "12:50",
          reason: i === 0 ? "W".repeat(90) : "Synthetic lunch correction",
          revision: 1,
          entered: {
            initials: "TT",
            actor: "test",
            at: "2026-10-15T18:00:00Z",
            revision: 1,
          },
        })),
      },
    };
    const bytes = await renderForm(fixture, template, font);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getForm().getFields()).toHaveLength(0);
    await writeFile(path.join(tmpdir(), "etime-layout-qa.pdf"), bytes);
    fixture.state.entries = Array.from({ length: 100 }, (_, i) => ({
      ...fixture.state.entries[0],
      id: String(i),
    }));
    const large = await renderForm(fixture, template, font);
    expect((await PDFDocument.load(large)).getPageCount()).toBeGreaterThan(10);
    expect(large.byteLength).toBeLessThan(4_000_000);
  },
);
