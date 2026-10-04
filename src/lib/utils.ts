import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Decimal from "decimal.js";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function rupiah(value: Decimal.Value) {
  return `Rp ${new Decimal(value || 0)
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
export function dateID(value: string) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}
export function invoiceStatus(i: {
  cancelled_at: string | null;
  paid: string;
  total: string;
}) {
  return i.cancelled_at
    ? "Dibatalkan"
    : new Decimal(i.paid).gte(i.total)
      ? "Lunas"
      : new Decimal(i.paid).gt(0)
        ? "Dibayar sebagian"
        : "Belum dibayar";
}
