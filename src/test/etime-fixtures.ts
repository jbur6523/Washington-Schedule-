import type { EtimeForm } from "@/lib/etime/model";

export function reviewForm(id = "form-a", lastName = "Employee"): EtimeForm {
  return {
    id,
    identity_id: id,
    department_id: "department",
    period_start: "2026-10-11",
    revision: 4,
    updated_at: "2026-10-15T12:00:00Z",
    state: {
      identity: { employee_id: "123", first_name: "Test", last_name: lastName },
      contentRevision: 3,
      employeeSignature: {
        name: `Test ${lastName}`,
        actor: "employee",
        at: "2026-10-15T12:00:00Z",
        contentRevision: 3,
      },
      entries: [0, 1, 2].map((index) => ({
        id: `entry-${index}`,
        date: "2026-10-14",
        category: index === 0 ? "lunch" : "education",
        reason: "Test exception",
        revision: 1,
        entered: {
          initials: "OA",
          actor: "reviewer:olive",
          at: "2026-10-15T12:00:00Z",
          revision: 1,
        },
      })),
    },
  };
}
