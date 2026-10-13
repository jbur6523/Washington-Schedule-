import { wallTimeToIso } from "@/lib/time/zoned-date-time";

export const stages = ["order", "delivery", "pickup", "returned"] as const;
export type Stage = (typeof stages)[number];
export const stageLabels: Record<Stage, string> = {
  order: "Ordered by",
  delivery: "Delivered by",
  pickup: "Called in by",
  returned: "Picked up by",
};
export type Attribution = { name: string; staff_profile_id: string | null };
export type EventInput = {
  staffId: string;
  name: string;
  date: string;
  time: string;
};
export const stageColumns: Record<Stage, string> = {
  order: "called_in_at",
  delivery: "checked_in_at",
  pickup: "pickup_requested_at",
  returned: "returned_at",
};

export function rentalState(status: string) {
  if (["pending_delivery", "called_in"].includes(status))
    return {
      label: "Pending Delivery",
      action: "delivery" as Stage,
      button: "Delivered",
      color: "text-blue-700",
      dot: "bg-blue-500",
    };
  if (["active", "delivered"].includes(status))
    return {
      label: "Active",
      action: "pickup" as Stage,
      button: "Return",
      color: "text-teal-700",
      dot: "bg-green-500",
    };
  if (
    ["pickup_requested", "pickup_called", "called_for_pickup"].includes(status)
  )
    return {
      label: "Pending Pick-up",
      action: "returned" as Stage,
      button: "Picked Up",
      color: "text-yellow-800",
      dot: "bg-yellow-400",
    };
  return {
    label: ["returned", "picked_up"].includes(status)
      ? "Returned"
      : "Cancelled",
    action: null,
    button: "",
    color: "text-slate-500",
    dot: "bg-slate-400",
  };
}

export function localFields(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  return {
    date: `${part("month")}/${part("day")}/${part("year")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

export function eventTimestamp(date: string, time: string, timezone: string) {
  if (
    !/^\d{2}\/\d{2}\/\d{4}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    return "";
  const [month, day, year] = date.split("/");
  return wallTimeToIso(`${year}-${month}-${day}`, time, timezone);
}

export function displayTimestamp(value: string | null, timezone: string) {
  if (!value) return "—";
  const fields = localFields(value, timezone);
  return `${fields.date} ${fields.time}`;
}
