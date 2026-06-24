import { CheckCircle2, X } from "lucide-react";

type ConfirmationModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ConfirmationModal({ open, onClose }: ConfirmationModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-5 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"
            aria-label="Close confirmation"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-2 pb-3 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={28} />
          </span>
          <h2 className="mt-4 text-xl font-black text-hospital-ink">
            Offer sent.
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            The request has been added to Washington Schedule.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-2xl bg-hospital-ink px-4 py-3 text-sm font-extrabold text-white shadow-lg"
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
