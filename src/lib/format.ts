/** "HH:MM" from an ISO timestamp, for the drop-location row, per-line return
 *  confirmation timestamps, etc. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "Tuesday 11 August 2026  13:52" — the delivery-proof "taken by" timestamp
 *  format, also used for the courier live-location card's "Picked up" line. */
export function formatTakenAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${weekday} ${d.getDate()} ${month} ${d.getFullYear()}  ${time}`;
}
