import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportScheduleAdmin } from "@/components/ImportScheduleAdmin";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { ScheduleImportPreview } from "@/lib/schedule-import/types";

const authContext: AuthenticatedUserContext = {
  authUserId: "auth-1",
  profileId: "profile-1",
  staffProfileId: "staff-1",
  departmentId: "department-1",
  departmentName: "Test RT",
  role: "admin",
  operationsRole: "none",
  displayName: "Local Administrator",
  hasLinkedStaffProfile: true
};

const cleanPreview: ScheduleImportPreview = {
  sourceHash: "a".repeat(64),
  metadata: { label: "Test", startsOn: "2026-08-23", endsOn: "2026-08-23" },
  activeVersion: { id: "version-1", label: "Active Schedule", startsOn: "2026-08-01", endsOn: "2026-08-31" },
  resultingRange: { startsOn: "2026-08-01", endsOn: "2026-08-31" },
  staff: [{ id: "staff-1", displayName: "Schedule Staff 01", username: "staff01" }],
  rows: [{
    lineNumber: 1,
    sourceLine: "ENTRY | 2026-08-23 | day_shift | 06:30 | 19:00 | staff01 | scheduled",
    kind: "entry",
    disposition: "new",
    issues: [],
    excluded: false,
    exclusionReason: "",
    shiftDate: "2026-08-23",
    shiftType: "day_shift",
    shiftStart: "06:30",
    shiftEnd: "19:00",
    staffIdentifier: "staff01",
    staffProfileId: "staff-1",
    staffDisplayName: "Schedule Staff 01",
    matchSource: "username",
    entryStatus: "scheduled",
    isShiftLead: false,
    severity: "",
    message: ""
  }],
  summary: {
    entryRows: 1,
    shortShiftRows: 0,
    matched: 1,
    newRows: 1,
    duplicatesSkipped: 0,
    unresolved: 0,
    internalDuplicates: 0,
    conflicts: 0,
    excluded: 0,
    uniqueDates: 1,
    firstDate: "2026-08-23",
    lastDate: "2026-08-23"
  },
  canCommit: true
};

afterEach(() => vi.unstubAllGlobals());

describe("ImportScheduleAdmin", () => {
  it("starts at Paste Code and removes every obsolete import path", () => {
    render(<ImportScheduleAdmin authContext={authContext} />);
    expect(screen.getByLabelText("Paste Schedule Code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Parse & Review" })).toBeInTheDocument();
    expect(screen.queryByText(/photo upload/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pdf upload/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/import mode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/create new schedule version/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add short shift/i })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("summarizes clean rows and keeps them collapsed under View All Rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ preview: cleanPreview })
    })));
    render(<ImportScheduleAdmin authContext={authContext} />);
    fireEvent.change(screen.getByLabelText("Paste Schedule Code"), { target: { value: cleanPreview.rows[0].sourceLine } });
    fireEvent.click(screen.getByRole("button", { name: "Parse & Review" }));
    await screen.findByRole("heading", { name: "Review" });
    expect(screen.getByText("Active Schedule")).toBeInTheDocument();
    const details = screen.getByText("View All Rows").closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("View All Rows"));
    expect(details).toHaveAttribute("open");
    expect(screen.queryByText("Rows requiring attention")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Upload" })).toBeEnabled();
  });

  it("allows exact existing duplicates while clearly marking them as skipped", async () => {
    const duplicatePreview: ScheduleImportPreview = {
      ...cleanPreview,
      rows: [{ ...cleanPreview.rows[0], disposition: "exact_duplicate" }],
      summary: { ...cleanPreview.summary, newRows: 0, duplicatesSkipped: 1 },
      canCommit: true
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ preview: duplicatePreview })
    })));
    render(<ImportScheduleAdmin authContext={authContext} />);
    fireEvent.change(screen.getByLabelText("Paste Schedule Code"), { target: { value: duplicatePreview.rows[0].sourceLine } });
    fireEvent.click(screen.getByRole("button", { name: "Parse & Review" }));
    await screen.findByRole("heading", { name: "Review" });
    expect(screen.getAllByText(/Already on schedule — will be skipped/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Continue to Upload" })).toBeEnabled();
  });

  it("surfaces conflicts and blocks upload until they are reviewed", async () => {
    const conflictPreview = {
      ...cleanPreview,
      rows: [{ ...cleanPreview.rows[0], disposition: "conflict" as const }],
      summary: { ...cleanPreview.summary, newRows: 0, conflicts: 1 },
      canCommit: false
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ preview: conflictPreview }) })));
    render(<ImportScheduleAdmin authContext={authContext} />);
    fireEvent.change(screen.getByLabelText("Paste Schedule Code"), { target: { value: conflictPreview.rows[0].sourceLine } });
    fireEvent.click(screen.getByRole("button", { name: "Parse & Review" }));
    await screen.findByText("Rows requiring attention");
    expect(screen.getAllByText(/Conflicts with an existing row/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Resolve Attention Rows" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Exclude row" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply Review Changes" })).toBeInTheDocument());
  });

  it("shows an independently verified result only after the commit endpoint confirms it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ preview: cleanPreview }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: "Schedule Updated",
          result: {
            importId: "import-1",
            versionId: "version-1",
            sourceHash: cleanPreview.sourceHash,
            sourceRows: 1,
            expectedRows: 1,
            insertedEntries: 1,
            duplicateEntries: 0,
            insertedShortages: 0,
            duplicateShortages: 0,
            insertedCount: 1,
            duplicateCount: 0,
            excludedCount: 0,
            conflictCount: 0,
            firstDate: "2026-08-23",
            lastDate: "2026-08-23",
            startsOn: "2026-08-01",
            endsOn: "2026-08-31",
            verified: true,
            independentlyVerified: true
          }
        })
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImportScheduleAdmin authContext={authContext} />);
    fireEvent.change(screen.getByLabelText("Paste Schedule Code"), { target: { value: cleanPreview.rows[0].sourceLine } });
    fireEvent.click(screen.getByRole("button", { name: "Parse & Review" }));
    await screen.findByRole("heading", { name: "Review" });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Upload" }));
    expect(screen.getByRole("heading", { name: "Upload" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to Schedule" }));
    expect(await screen.findByRole("heading", { name: "Schedule Updated" })).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 1 new rows verified/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
