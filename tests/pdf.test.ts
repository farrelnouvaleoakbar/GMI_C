import { expect, it } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { invoicePDF } from "../src/lib/pdf";
import type { Invoice, Calculation, CalculatedLine } from "../src/lib/types";
const line: CalculatedLine = {
  line_id: "1",
  product_id: "p",
  product_version: 1,
  sku: "SKU-01",
  name: "Produk pelanggan",
  unit: "pcs",
  quantity: "1",
  purchase_price: "98765.43",
  shipping_per_unit: "5000",
  profit_percent: "20",
  marketing_percent: "5",
  operational_percent: "10",
  recommended_price: "150000",
  selected_price: "150000",
  line_total: "150000",
  operational_cost: "333.22",
  marketing_cost: "555.44",
  profit: "789.04",
};
const calculation: Calculation = {
  company: {
    company_name: "PT Niaga Indonesia",
    address: "Jl. Merdeka 1, Jakarta",
    contact: "finance@example.invalid",
    logo_path: null,
    tax_percent: "11",
    profit_percent: "20",
    marketing_percent: "5",
    operational_percent: "10",
    invoice_prefix: "INV",
    version: 1,
  },
  customer: {
    id: "c",
    owner_id: "s",
    name: "Pelanggan Indonesia",
    email: "pelanggan@example.invalid",
    phone: "08123456789",
    address: "Jakarta",
    archived: false,
    version: 1,
  },
  lines: [line],
  shipping: "5000",
  subtotal: "150000",
  purchase: "98765.43",
  operational: "333.22",
  marketing: "555.44",
  tax_percent: "11",
  tax: "17050",
  total: "172050",
  profit: "789.04",
  notes: "Terima kasih",
  due_date: "2026-10-18",
  shipping_rule: "Ongkir sekali",
};
const invoice: Invoice = {
  id: "i",
  draft_id: "d",
  owner_id: "s",
  number: "INV/2026/000001",
  snapshot: calculation,
  total: calculation.total,
  paid: "0",
  version: 1,
  revision_of: null,
  issued_at: "2026-10-04T00:00:00Z",
  cancelled_at: null,
  cancellation_reason: null,
};
async function renderedText(pdf: PDFDocument) {
  let text = "";
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        const raw = new TextDecoder().decode(decodePDFRawStream(obj).decode());
        for (const m of raw.matchAll(/<([0-9A-Fa-f]+)>/g))
          text += `${Buffer.from(m[1], "hex").toString("latin1")}\n`;
      } catch {
        /* Nontext streams. */
      }
    }
  }
  return text;
}
it("PDF menampilkan merek dan tagihan tanpa modal atau profit internal", async () => {
  const pdf = await PDFDocument.load(await invoicePDF(invoice));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getTitle()).toBe("Invoice INV/2026/000001");
  const text = await renderedText(pdf);
  expect(text).toContain("PT Niaga Indonesia");
  expect(text).toContain("Pelanggan Indonesia");
  expect(text).toContain("Rp 172.050,00");
  for (const secret of [
    "98.765,43",
    "789,04",
    "333,22",
    "555,44",
    "profit",
    "Modal",
  ])
    expect(text).not.toContain(secret);
});
it("PDF draf ditandai belum diterbitkan dan tetap menyembunyikan biaya internal", async () => {
  const pdf = await PDFDocument.load(await invoicePDF({ ...invoice, number: "DRAF-00000001" }, undefined, "draft"));
  expect(pdf.getTitle()).toBe("Draf transaksi DRAF-00000001");
  const text = await renderedText(pdf);
  expect(text).toContain("DRAF TRANSAKSI");
  expect(text).toContain("BELUM DITERBITKAN");
  expect(text).toContain("Rp 172.050,00");
  for (const secret of ["98.765,43", "789,04", "333,22", "555,44", "profit", "Modal"])
    expect(text).not.toContain(secret);
});
it("PDF panjang memakai beberapa halaman dan mempertahankan baris terakhir", async () => {
  const many = {
    ...invoice,
    snapshot: {
      ...calculation,
      lines: Array.from({ length: 100 }, (_, i) => ({
        ...line,
        name: `Produk ${i + 1}`,
      })),
    },
  };
  const pdf = await PDFDocument.load(await invoicePDF(many));
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(await renderedText(pdf)).toContain("Produk 100");
});
it("PDF pembatalan mempertahankan invoice dan alasan", async () => {
  const pdf = await PDFDocument.load(
    await invoicePDF({
      ...invoice,
      cancelled_at: "2026-10-05",
      cancellation_reason: "Pesanan dibatalkan pelanggan",
    }),
  );
  expect(await renderedText(pdf)).toContain(
    "DIBATALKAN: Pesanan dibatalkan pelanggan",
  );
});
