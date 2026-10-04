import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Invoice } from "./types";
import { rupiah, dateID } from "./utils";
export async function invoicePDF(
  invoice: Invoice,
  logo?: Uint8Array,
  kind: "invoice" | "draft" = "invoice",
) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]),
    y = 790;
  const clean = (s: string) =>
    s
      .replace(/[–−]/g, "-")
      .replace(/→/g, ">")
      .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
  function next() {
    page = pdf.addPage([595.28, 841.89]);
    y = 790;
    page.drawRectangle({
      x: 0,
      y: 825,
      width: 595.28,
      height: 17,
      color: rgb(0.09, 0.36, 0.32),
    });
  }
  function text(s: string, size = 10, strong = false, x = 44) {
    const font = strong ? bold : regular;
    for (const paragraph of clean(s).split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        if (font.widthOfTextAtSize(`${line} ${word}`, size) > 505 && line) {
          if (y < 60) next();
          page.drawText(line, {
            x,
            y,
            size,
            font,
            color: rgb(0.13, 0.19, 0.25),
          });
          y -= size + 6;
          line = "";
        }
        // Long unbroken words (SKU/address/reference) are split to fit the page.
        const pieces: string[] = [];
        let piece = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(piece + char, size) > 505 && piece) {
            pieces.push(piece);
            piece = "";
          }
          piece += char;
        }
        pieces.push(piece);
        for (const part of pieces) {
          if (font.widthOfTextAtSize(`${line} ${part}`, size) > 505 && line) {
            if (y < 60) next();
            page.drawText(line, { x, y, size, font });
            y -= size + 6;
            line = "";
          }
          line += (line ? " " : "") + part;
        }
      }
      if (y < 60) next();
      page.drawText(line, { x, y, size, font, color: rgb(0.13, 0.19, 0.25) });
      y -= size + 6;
    }
  }
  for (const p of pdf.getPages())
    p.drawRectangle({
      x: 0,
      y: 825,
      width: 595.28,
      height: 17,
      color: rgb(0.09, 0.36, 0.32),
    });
  const c = invoice.snapshot;
  if (logo) {
    try {
      const img =
        logo[0] === 137 ? await pdf.embedPng(logo) : await pdf.embedJpg(logo);
      const d = img.scaleToFit(100, 48);
      page.drawImage(img, {
        x: 44,
        y: y - d.height,
        width: d.width,
        height: d.height,
      });
      y -= 60;
    } catch {
      /* Company text remains if logo bytes cannot be embedded. */
    }
  }
  text(c.company.company_name, 21, true);
  text(c.company.address);
  text(c.company.contact);
  y -= 12;
  text(kind === "draft" ? "DRAF TRANSAKSI · BELUM DITERBITKAN" : "INVOICE", 24, true);
  text(invoice.number, 12, true);
  text(
    `Tanggal: ${c.invoice_date ?? dateID(invoice.issued_at)}    Jatuh tempo: ${dateID(c.due_date)}`,
  );
  if (invoice.cancelled_at)
    text(`DIBATALKAN: ${invoice.cancellation_reason}`, 12, true);
  y -= 12;
  text("DITAGIHKAN KEPADA", 9, true);
  text(c.customer.name, 12, true);
  text(c.customer.address);
  text([c.customer.email, c.customer.phone].filter(Boolean).join(" | "));
  if (c.shipping_address) text(`Alamat pengiriman: ${c.shipping_address}`);
  if (c.shipping_carrier) text(`Kurir: ${c.shipping_carrier}`);
  y -= 14;
  text("RINCIAN PRODUK", 10, true);
  for (const [idx, line] of c.lines.entries()) {
    if (y < 120) next();
    text(`${idx + 1}. ${line.name}${line.brand ? ` · ${line.brand}` : ""}${line.variant ? ` · ${line.variant}` : ""} (${line.sku})`, 11, true);
    text(
      `${line.quantity} ${line.unit} x ${rupiah(line.selected_price)} = ${rupiah(line.line_total)}`,
    );
    y -= 6;
  }
  y -= 10;
  text(`Subtotal barang${c.tax_mode === "included" ? " (termasuk pajak)" : ""}: ${rupiah(c.subtotal)}`, 11);
  text(`Ongkir: ${rupiah(c.shipping)}`, 11);
  if (c.tax_enabled !== false && c.tax_name && c.tax_product) {
    const includeNote = c.tax_mode === "included" ? " (termasuk dalam harga)" : "";
    text(`${c.tax_name} produk${includeNote}: ${rupiah(c.tax_product)}`, 11);
    if (c.tax_shipping) text(`${c.tax_name} ongkir${includeNote}: ${rupiah(c.tax_shipping)}`, 11);
  } else text(`Pajak (${c.tax_percent}%): ${rupiah(c.tax)}`, 11);
  text(`TOTAL TAGIHAN: ${rupiah(c.total)}`, 16, true);
  if (c.notes) {
    y -= 14;
    text("Catatan", 10, true);
    text(c.notes);
  }
  y -= 14;
  text("Terima kasih atas kepercayaan Anda.", 10);
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${invoice.number} | ${i + 1} / ${pages.length}`, {
      x: 44,
      y: 26,
      size: 8,
      font: regular,
      color: rgb(0.4, 0.45, 0.5),
    });
  });
  pdf.setTitle(`${kind === "draft" ? "Draf transaksi" : "Invoice"} ${invoice.number}`);
  pdf.setAuthor(c.company.company_name);
  return pdf.save();
}
