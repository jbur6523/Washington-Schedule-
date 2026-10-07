"use client";
import { useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import type {
  IcuDeviceType,
  IcuPatientRecord,
} from "@/lib/icu-command-center/types";
import {
  formatIcuSettings,
  icuDeviceLabels,
  icuVentModeLabels,
  ventModeOptions,
} from "@/lib/icu-command-center/utils";
export type ModalitySettings = Record<string, string | number | boolean | null>;
export type ModalityAction = "save" | "switch" | "discontinue";
export type SaveModality = (
  modality: IcuDeviceType,
  settings: ModalitySettings,
  action: ModalityAction,
  version: string,
) => Promise<boolean>;
function fieldsFor(type: IcuDeviceType, mode: string): string[][] {
  if (type === "bipap")
    return [
      ["ipap", "IPAP"],
      ["epap", "EPAP"],
      ["rate", "Rate"],
      ["fio2", "FiO₂ (%)"],
    ];
  if (type === "cpap") return [["cpap", "CPAP"]];
  if (type !== "vent")
    return [
      ["flow", "Flow (L/min)"],
      ["fio2", "FiO₂ (%)"],
    ];
  const oxygen = ["fio2", "FiO₂ (%)"];
  if (mode === "spont") return [["ps", "PS"], ["peep", "PEEP"], oxygen];
  if (mode === "asv")
    return [["percent_min_vol", "% Min Vol"], ["peep", "PEEP"], oxygen];
  if (mode === "aprv")
    return [
      ["rate", "Rate"],
      ["t_high", "T-High"],
      ["t_low", "T-Low"],
      ["p_high", "P-High"],
      ["p_low", "P-Low"],
      oxygen,
    ];
  return [
    ["rate", "Rate"],
    ["tidal_volume", "Tidal Volume"],
    ["peep", "PEEP"],
    oxygen,
  ];
}
export function IcuModalityActions({
  record,
  saving,
  onSave,
}: {
  record: IcuPatientRecord;
  saving: boolean;
  onSave: SaveModality;
}) {
  const types = Object.keys(icuDeviceLabels) as IcuDeviceType[];
  const available = types.filter(
    (type) =>
      type !== record.device_type && !record.rounding_data?.modalities?.[type],
  );
  const saved = types.filter(
    (type) =>
      type !== record.device_type && record.rounding_data?.modalities?.[type],
  );
  const [panel, setPanel] = useState<ModalityAction | null>(null);
  const [modality, setModality] = useState<IcuDeviceType>(
    available[0] ?? "hfnc",
  );
  const [version, setVersion] = useState(record.updated_at);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const label = icuDeviceLabels[modality];
  const profile = record.rounding_data?.modalities?.[modality];
  const fields = fieldsFor(modality, draft.vent_mode);
  const buttonClass =
    "inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-sky-700 bg-white px-3 text-xs font-extrabold text-sky-900 disabled:opacity-50";
  const inputClass =
    "mt-1 min-h-11 w-full rounded-xl border-2 border-slate-500 bg-white px-3 text-sm text-slate-900";
  const open = (action: ModalityAction, type: IcuDeviceType) => {
    setModality(type);
    setVersion(record.updated_at);
    setDraft({ airway_type: "ett" });
    setError("");
    setPanel(action);
  };
  const select = (
    key: string,
    name: string,
    options: string[][],
    required = false,
  ) => (
    <label className="text-xs font-bold text-slate-800">
      {name}
      <select
        required={required}
        disabled={saving}
        value={draft[key] ?? ""}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        className={inputClass}
      >
        <option value="">Select</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="mt-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {saved.map((type) => (
          <div key={type} className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={saving || !!panel}
              onClick={() => open("switch", type)}
              className={buttonClass}
            >
              <ArrowLeftRight size={15} />
              Switch to {icuDeviceLabels[type]}
            </button>
            <button
              type="button"
              disabled={saving || !!panel}
              onClick={() => open("discontinue", type)}
              className="min-h-10 px-2 text-xs font-bold text-rose-800 underline underline-offset-2"
            >
              Discontinue {icuDeviceLabels[type]}
            </button>
          </div>
        ))}
        {available.length > 0 && (
          <button
            type="button"
            disabled={saving || !!panel}
            onClick={() => open("save", available[0])}
            className={buttonClass}
          >
            <Plus size={15} />
            Add additional
          </button>
        )}
      </div>
      {panel && (
        <form
          aria-label={`${panel === "switch" ? "Switch to" : panel === "discontinue" ? "Discontinue" : "Save additional"} ${label}`}
          className="mt-2 space-y-3 rounded-2xl border-2 border-sky-600 bg-sky-50 p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            const values: ModalitySettings = Object.fromEntries(
              fields.map(([key]) => [
                key,
                draft[key]?.trim() ? Number(draft[key]) : null,
              ]),
            );
            if (modality === "vent" && panel === "save") {
              for (const key of [
                "vent_mode",
                "airway_type",
                "airway_size",
                "airway_at",
                "airway_location",
                "trach_type",
              ])
                values[key] = draft[key] || null;
              values.trach_xlt = draft.trach_xlt === "true";
            }
            if (await onSave(modality, values, panel, version)) setPanel(null);
            else
              setError(
                "Could not save. Close and reopen to review the latest settings and try again.",
              );
          }}
        >
          <p className="text-sm font-extrabold text-slate-900">
            {panel === "switch"
              ? `Switch to ${label}?`
              : panel === "discontinue"
                ? `Discontinue saved ${label}?`
                : "Additional modality"}
          </p>
          {panel === "discontinue" ? (
            <p className="text-sm text-slate-800">
              Remove saved {label}. Current support stays{" "}
              {icuDeviceLabels[record.device_type]}. Its history will remain
              available.
            </p>
          ) : panel === "switch" ? (
            <p className="text-sm font-bold text-slate-800">
              {modality === "vent" &&
                `${icuVentModeLabels[profile?.vent_mode as keyof typeof icuVentModeLabels] ?? ""} · `}
              {formatIcuSettings({
                ...profile,
                device_type: modality,
              } as IcuPatientRecord)}
            </p>
          ) : (
            <>
              <label className="block text-xs font-bold">
                Device
                <select
                  value={modality}
                  disabled={saving}
                  onChange={(e) => {
                    setModality(e.target.value as IcuDeviceType);
                    setDraft({ airway_type: "ett" });
                  }}
                  className={inputClass}
                >
                  {available.map((type) => (
                    <option key={type} value={type}>
                      {icuDeviceLabels[type]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-700">
                Save for later. Current support stays{" "}
                {icuDeviceLabels[record.device_type]}.
              </p>
              {modality === "vent" && (
                <div className="grid grid-cols-2 gap-3">
                  {select(
                    "vent_mode",
                    "Vent Mode",
                    ventModeOptions.map((mode) => [
                      mode,
                      icuVentModeLabels[mode],
                    ]),
                    true,
                  )}
                  {select(
                    "airway_type",
                    "Airway",
                    [
                      ["ett", "ETT"],
                      ["trach", "Trach"],
                    ],
                    true,
                  )}
                  {select(
                    "airway_size",
                    "Airway Size",
                    (draft.airway_type === "trach"
                      ? ["4", "5", "6", "7", "8"]
                      : ["6", "6.5", "7", "7.5", "8"]
                    ).map((size) => [size, size]),
                    draft.airway_type === "trach",
                  )}
                  {draft.airway_type === "trach" ? (
                    <>
                      {select(
                        "trach_type",
                        "Trach Type",
                        [
                          ["shiley", "Shiley"],
                          ["portex", "Portex"],
                          ["other", "Other"],
                        ],
                        true,
                      )}
                      <label className="flex items-center gap-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          disabled={saving}
                          checked={draft.trach_xlt === "true"}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              trach_xlt: String(e.target.checked),
                            })
                          }
                        />
                        XLT
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="text-xs font-bold">
                        At
                        <input
                          type="number"
                          min="0"
                          step="any"
                          disabled={saving}
                          value={draft.airway_at ?? ""}
                          onChange={(e) =>
                            setDraft({ ...draft, airway_at: e.target.value })
                          }
                          className={inputClass}
                        />
                      </label>
                      {select("airway_location", "Location", [
                        ["teeth", "Teeth"],
                        ["gum", "Gum"],
                        ["nare", "Nare"],
                      ])}
                    </>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {fields.map(([key, name]) => (
                  <label key={key} className="text-xs font-bold text-slate-800">
                    {name}
                    <input
                      type="number"
                      min="0"
                      max={key === "fio2" ? 100 : undefined}
                      step="any"
                      value={draft[key] ?? ""}
                      disabled={saving}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: e.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm font-bold text-rose-800">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || version !== record.updated_at}
              className={`min-h-11 rounded-xl px-4 text-xs font-extrabold text-white disabled:opacity-50 ${panel === "discontinue" ? "bg-rose-700" : "bg-cyan-700"}`}
            >
              {saving
                ? "Saving…"
                : panel === "switch"
                  ? `Switch to ${label}`
                  : panel === "discontinue"
                    ? `Discontinue ${label}`
                    : "Save modality"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setPanel(null)}
              className={buttonClass}
            >
              Cancel
            </button>
          </div>
          {version !== record.updated_at && (
            <p role="alert" className="text-sm text-rose-800">
              This patient changed. Cancel and reopen to review the latest
              settings.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
