"use client";

import type { EtimeForm } from "@/lib/etime/model";
import {
  allEntriesEntered,
  canManagerSign,
  isApproved,
} from "@/lib/etime/workflow";
import { Signature } from "./Signature";

export function ManagerSignOff({
  form,
  name,
  savedName,
  busy,
  onSign,
}: {
  form: EtimeForm;
  name: string;
  savedName?: string | null;
  busy: boolean;
  onSign: (name: string, adopted: boolean) => void;
}) {
  return (
    <section aria-label="Manager sign-off" className="space-y-3">
      <h3 className="text-lg font-black">Manager sign-off</h3>
      {isApproved(form.state) ? (
        <p className="rounded-xl bg-green-50 p-4 text-green-900">
          This version has been signed by {form.state.managerSignature!.name}.
        </p>
      ) : canManagerSign(form.state) ? (
        <Signature
          key={`${form.id}:${form.revision}`}
          expected={name}
          savedName={savedName}
          busy={busy}
          label="Sign Timecard"
          onSign={onSign}
        />
      ) : (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          {!allEntriesEntered(form.state) && (
            <p>
              Every exception must be initialed before you can sign this
              timecard.
            </p>
          )}
          {form.state.employeeSignature?.contentRevision !==
            form.state.contentRevision && (
            <p>
              Awaiting employee signature. The employee must sign the current
              version before you can sign this timecard.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
