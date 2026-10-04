import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { adminClient } from "./supabase";
import { invoicePDF } from "./pdf";
import { checkError, HttpError } from "./auth";
import type { Invoice } from "./types";
// Call only after authorization using the session-scoped, RLS-protected invoice.
export async function ensureInvoicePDF(invoice: Invoice) {
  const admin = adminClient(),
    file = `${invoice.id}/${invoice.cancelled_at ? "cancelled" : "issued"}.pdf`;
  const downloaded = await admin.storage.from("invoice-pdfs").download(file);
  if (downloaded.data && !downloaded.error) return downloaded.data;
  let logo: Uint8Array | undefined;
  if (invoice.snapshot.company.logo_path) {
    if (invoice.snapshot.company.logo_path === "brand:gmi-logo") {
      logo = new Uint8Array(await readFile(join(process.cwd(), "public/brand/gmi-logo.png")));
    } else {
      const { data, error } = await admin.storage
        .from("company-assets")
        .download(invoice.snapshot.company.logo_path);
      checkError(error);
      if (data) logo = new Uint8Array(await data.arrayBuffer());
    }
  }
  const bytes = await invoicePDF(invoice, logo);
  const { error } = await admin.storage
    .from("invoice-pdfs")
    .upload(file, bytes, { contentType: "application/pdf", upsert: true });
  checkError(error);
  const stored = await admin.storage.from("invoice-pdfs").download(file);
  checkError(stored.error);
  if (!stored.data)
    throw new HttpError(500, "PDF gagal dibuat. Silakan coba unduh kembali.");
  return stored.data;
}
