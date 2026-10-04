import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { calculateLine, recommendTransactionPrices } from "../src/lib/pricing";
const ids = {
  admin: "00000000-0000-0000-0000-000000000001",
  sales: "00000000-0000-0000-0000-000000000002",
  other: "00000000-0000-0000-0000-000000000003",
  finance: "00000000-0000-0000-0000-000000000004",
  inactive: "00000000-0000-0000-0000-000000000005",
  product: "10000000-0000-0000-0000-000000000001",
  customer: "20000000-0000-0000-0000-000000000001",
  otherCustomer: "20000000-0000-0000-0000-000000000002",
};
let db: PGlite;
let draft: string, invoice: string, payment: string, revisedInvoice: string;
const inputs = {
  customer_id: ids.customer,
  shipping: "20000",
  tax: { enabled: false },
  due_date: "2026-12-01",
  notes: "Terima kasih",
  lines: [
    {
      product_id: ids.product,
      quantity: "2",
      profit_percent: "20",
      marketing_percent: "5",
      operational_percent: "10",
      rounding: "0",
      selected_price: null,
    },
  ],
  total: "1",
  purchase_price: "1",
};
async function as<T>(actor: string, fn: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      actor,
    ]);
    const r = await fn();
    await db.exec("commit");
    return r;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
async function rpc<T = unknown>(name: string, args: unknown[] = []) {
  const params = args.map((_, i) => `$${i + 1}`).join(",");
  const r = await db.query<{ result: T }>(
    `select public.${name}(${params}) as result`,
    args,
  );
  return r.rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("supabase/tests/platform-stub.sql", "utf8"));
  for (const file of [
    "202610040001_core.sql",
    "202610040002_dashboard.sql",
    "202610040003_decimal_views.sql",
    "202610040004_calculator_options.sql",
    "202610040005_gmi_catalog.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  for (const [name, id] of Object.entries(ids).slice(0, 5)) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${name}@test.local`,
    ]);
    await db.query(
      "update public.profiles set role=$2::public.staff_role,active=$3 where id=$1",
      [
        id,
        name === "other" || name === "inactive" ? "sales" : name,
        name !== "inactive",
      ],
    );
  }
  await db.query(
    "insert into public.products(id,sku,name,purchase_price) values($1,'SKU-01','Produk uji',100000)",
    [ids.product],
  );
  await db.query("insert into public.operational_categories(name) values('Sewa')");
  await db.query(
    "insert into public.customers(id,owner_id,name) values($1,$2,'Pelanggan A'),($3,$4,'Pelanggan B')",
    [ids.customer, ids.sales, ids.otherCustomer, ids.other],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("Migrasi dan keamanan PostgreSQL", () => {
  it("RLS membatasi pelanggan Sales dan menolak penulisan langsung", async () => {
    const rows = await as(ids.sales, () =>
      db.query("select * from public.customers"),
    );
    expect(rows.rows).toHaveLength(1);
    await expect(
      as(ids.sales, () =>
        db.query("update public.products set purchase_price=1"),
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      as(ids.sales, () =>
        rpc("save_master", [
          "products",
          { name: "Palsu", sku: "BAD", purchase_price: "1" },
        ]),
      ),
    ).rejects.toThrow("Akses ditolak");
  });
  it("seed katalog GMI menyimpan harga daftar sebagai referensi dan tidak mengarang modal", async () => {
    await db.exec(readFileSync("supabase/seeds/gmi_catalog.sql", "utf8"));
    const result = await db.query<{ total: string; modal: string; listed: string; stale: string }>(
      `select count(*)::text as total,
       count(*) filter (where purchase_price is not null)::text as modal,
       count(*) filter (where list_price is not null and list_price_tax_included)::text as listed,
       count(*) filter (where list_price_as_of='2024-01-01' and list_price_source like '%SINY%')::text as stale
       from public.products where sku like 'EG%' or sku like 'NSR%' or sku like 'SR%' or sku like 'ES%' or sku like 'SINY-%'`,
    );
    expect(result.rows[0]).toEqual({ total: "139", modal: "0", listed: "139", stale: "3" });
  });
  it("seed estimasi Kasa mengisi modal/unit dan menandai asal estimasi", async () => {
    await db.exec(readFileSync("supabase/seeds/gmi_kasa_estimated_modal.sql", "utf8"));
    const result = await db.query<{ total: string; estimated: string; listed: string; costs: string }>(
      `select count(*)::text as total,
       count(*) filter (where purchase_price is not null and category ilike '%estimasi modal%')::text as estimated,
       count(*) filter (where list_price is not null)::text as listed,
       sum(purchase_price)::text as costs
       from public.products where sku like 'KASA-%'`,
    );
    expect(result.rows[0]).toEqual({ total: "15", estimated: "15", listed: "0", costs: "287399.00" });
  });
  it("seed modal katalog GMI mengisi semua referensi dan mempertahankan modal aktual", async () => {
    const seed = readFileSync("supabase/seeds/gmi_catalog_modal_estimates.sql", "utf8");
    await db.exec(seed);
    const counts = await db.query<{ total: string; costs: string; estimated: string; supplier: string }>(
      `select count(*)::text as total,
       count(*) filter (where purchase_price is not null)::text as costs,
       count(*) filter (where category ilike '%estimasi modal 20% ex PPN%')::text as estimated,
       count(*) filter (where category ilike '%supplier SINY 2024%')::text as supplier
       from public.products where sku like 'EG%' or sku like 'NSR%' or sku like 'SR%' or sku like 'ES%' or sku like 'SINY-%'`,
    );
    expect(counts.rows[0]).toEqual({ total: "139", costs: "139", estimated: "136", supplier: "3" });
    const sample = await db.query<{ purchase_price: string }>("select purchase_price::text from public.products where sku='EGDOAM31-TEST'");
    expect(sample.rows[0].purchase_price).toBe("12987.99");
    await db.exec("update public.products set purchase_price=13000, category='Drug Abuse Test' where sku='EGDOAM31-TEST'");
    await db.exec(seed);
    const preserved = await db.query<{ purchase_price: string; category: string }>("select purchase_price::text,category from public.products where sku='EGDOAM31-TEST'");
    expect(preserved.rows[0]).toEqual({ purchase_price: "13000.00", category: "Drug Abuse Test" });
  });
  it("akun tidak aktif tidak dapat membaca produk atau menulis", async () => {
    const r = await as(ids.inactive, () =>
      db.query("select * from public.products"),
    );
    expect(r.rows).toHaveLength(0);
    await expect(
      as(ids.inactive, () => rpc("preview_draft", [inputs])),
    ).rejects.toThrow("Akses ditolak");
  });
  it("Finance tidak dapat membuat draf atau menerbitkan invoice", async () => {
    await expect(
      as(ids.finance, () => rpc("save_draft", [inputs])),
    ).rejects.toThrow("Akses ditolak");
  });
  it("Sales tidak dapat menghitung atau memodifikasi pelanggan orang lain", async () => {
    await expect(
      as(ids.other, () => rpc("preview_draft", [inputs])),
    ).rejects.toThrow("Pelanggan tidak dapat diakses");
    await expect(
      as(ids.other, () =>
        rpc("save_master", ["customers", { name: "Dicuri" }, ids.customer, 1]),
      ),
    ).rejects.toThrow("Pelanggan tidak dapat diakses");
  });
  it("SQL cocok dengan Decimal.js dan mengabaikan total browser", async () => {
    const p = await as(ids.sales, () =>
      rpc<{
        calculation: { lines: { recommended_price: string }[]; total: string };
      }>("preview_draft", [inputs]),
    );
    expect(p.calculation.lines[0].recommended_price).toBe(
      calculateLine(100000, 10000, 2, 20, 5, 10).recommended,
    );
    expect(p.calculation.total).toBe("313975.90");
  });
  it("SQL menolak penyebut nol atau negatif", async () => {
    const invalid = {
      ...inputs,
      lines: [
        {
          ...inputs.lines[0],
          marketing_percent: "40",
          operational_percent: "50",
        },
      ],
    };
    await expect(
      as(ids.sales, () => rpc("preview_draft", [invalid])),
    ).rejects.toThrow("Target tidak dapat dicapai");
  });
  it("SQL menyimpan pajak termasuk, kategori biaya, dan detail ongkir provisional", async () => {
    const quote = {
      ...inputs,
      shipping: "11000",
      target_percent: "20",
      marketing_percent: "5",
      invoice_date: "2026-11-20",
      operations: [{ name: "Sewa", percent: "10" }],
      tax: { enabled: true, name: "PPN", rate: "11", mode: "included", base: "products_shipping" },
      lines: inputs.lines.map((line) => ({ ...line, rounding: "100" })),
    };
    const sql = await as(ids.sales, () => rpc<{ calculation: Record<string, unknown> }>("preview_draft", [quote]));
    const js = recommendTransactionPrices({
      lines: [{ cost: "100000", quantity: "2", manual: null, rounding: "100" }],
      shipping: "11000", targetPercent: "20", marketingPercent: "5",
      operations: [{ name: "Sewa", percent: "10" }],
      tax: { enabled: true, name: "PPN", rate: "11", mode: "included", base: "products_shipping" },
    });
    expect(sql.calculation.total).toBe(js.total);
    expect(sql.calculation.invoice_date).toBe("2026-11-20");
    expect(sql.calculation.profit).toBe(js.profit);
    expect(sql.calculation.tax_shipping).toBe(js.taxShipping);
    expect((sql.calculation.operational_items as { name: string }[])[0].name).toBe("Sewa");
    const provisional = await as(ids.sales, () => rpc<{ calculation: Record<string, unknown> }>("preview_draft", [{ ...quote, shipping: null }]));
    expect(provisional.calculation.provisional).toBe(true);
  });
  it("menolak penerbitan invoice saat ongkir masih provisional", async () => {
    const provisional = { ...inputs, shipping: null };
    const draftId = await as(ids.sales, () => rpc<string>("save_draft", [provisional]));
    const error = await as(ids.sales, async () => {
      const row = await db.query<{ version: number; calculation_hash: string }>("select version,calculation_hash from public.drafts where id=$1", [draftId]);
      return rpc("issue_invoice", [draftId, row.rows[0].version, row.rows[0].calculation_hash, null]);
    }).catch((e: Error) => e);
    expect((error as Error).message).toContain("Isi ongkir sebelum menerbitkan invoice");
  });
  it("menolak tanggal jatuh tempo sebelum tanggal invoice", async () => {
    await expect(as(ids.sales, () => rpc("preview_draft", [{ ...inputs, invoice_date: "2026-12-02", due_date: "2026-12-01" }]))).rejects.toThrow("tidak boleh mendahului");
  });
});
describe("Draf, penerbitan, dan snapshot", () => {
  it("menyimpan draf dan menolak versi basi", async () => {
    draft = await as(ids.sales, () => rpc<string>("save_draft", [inputs]));
    await expect(
      as(ids.sales, () => rpc("save_draft", [inputs, draft, 99])),
    ).rejects.toThrow("Draf telah berubah");
  });
  it("perubahan modal wajib ditinjau sebelum penerbitan", async () => {
    const old = await as(ids.sales, () =>
      rpc<{ hash: string }>("preview_draft", [inputs, draft]),
    );
    await as(ids.admin, () =>
      rpc("save_master", [
        "products",
        {
          name: "Produk uji",
          sku: "SKU-01",
          unit: "pcs",
          purchase_price: "120000",
        },
        ids.product,
        1,
      ]),
    );
    await expect(
      as(ids.sales, () => rpc("issue_invoice", [draft, 1, old.hash])),
    ).rejects.toThrow("Harga, pelanggan, atau pengaturan berubah");
  });
  it("terbit transaksional dan retry mengembalikan nomor yang sama", async () => {
    await as(ids.sales, () => rpc("save_draft", [inputs, draft, 1]));
    const preview = await as(ids.sales, () =>
      rpc<{ hash: string }>("preview_draft", [inputs, draft]),
    );
    invoice = await as(ids.sales, () =>
      rpc<string>("issue_invoice", [draft, 2, preview.hash]),
    );
    const retry = await as(ids.sales, () =>
      rpc("issue_invoice", [draft, 1, "stale"]),
    );
    expect(retry).toBe(invoice);
    const r = await db.query<{ number: string; total: string }>(
      "select number,total from public.invoices where id=$1",
      [invoice],
    );
    expect(r.rows[0].number).toMatch(/^INV\/\d{4}\/000001$/);
    expect(
      (
        await db.query<{ next_invoice: number }>(
          "select next_invoice from public.settings",
        )
      ).rows[0].next_invoice,
    ).toBe(2);
  });
  it("snapshot tidak berubah saat katalog berubah; issued draft tidak dapat diedit", async () => {
    await as(ids.admin, () =>
      rpc("save_master", [
        "products",
        {
          name: "Nama baru",
          sku: "SKU-01",
          unit: "pcs",
          purchase_price: "150000",
        },
        ids.product,
        2,
      ]),
    );
    const r = await db.query<{ name: string }>(
      "select snapshot->'lines'->0->>'name' as name from public.invoices where id=$1",
      [invoice],
    );
    expect(r.rows[0].name).toBe("Produk uji");
    await expect(
      as(ids.sales, () => rpc("save_draft", [inputs, draft, 2])),
    ).rejects.toThrow("sudah diterbitkan");
  });
  it("kerugian memerlukan hash kalkulasi terbaru untuk save dan issue", async () => {
    const loss = {
      ...inputs,
      lines: [{ ...inputs.lines[0], selected_price: "100" }],
    };
    await expect(
      as(ids.sales, () => rpc("save_draft", [loss])),
    ).rejects.toThrow("Transaksi rugi");
    let p = await as(ids.sales, () =>
      rpc<{ hash: string }>("preview_draft", [loss]),
    );
    const d = await as(ids.sales, () =>
      rpc<string>("save_draft", [loss, null, null, p.hash]),
    );
    p = await as(ids.sales, () =>
      rpc<{ hash: string }>("preview_draft", [loss, d]),
    );
    await expect(
      as(ids.sales, () => rpc("issue_invoice", [d, 1, p.hash])),
    ).rejects.toThrow("Konfirmasi kerugian");
    expect(
      await as(ids.sales, () => rpc("issue_invoice", [d, 1, p.hash, p.hash])),
    ).toBeTruthy();
  });
  it("revisi baru tidak membatalkan atau menimpa invoice asal", async () => {
    const d = await as(ids.sales, () =>
      rpc<string>("save_draft", [inputs, null, null, null, invoice]),
    );
    const p = await as(ids.sales, () =>
      rpc<{ hash: string }>("preview_draft", [inputs, d]),
    );
    const revised = await as(ids.sales, () =>
      rpc<string>("issue_invoice", [d, 1, p.hash]),
    );
    revisedInvoice = revised;
    expect(revised).not.toBe(invoice);
    const r = await db.query<{ cancelled_at: null }>(
      "select cancelled_at from public.invoices where id=$1",
      [invoice],
    );
    expect(r.rows[0].cancelled_at).toBeNull();
  });
  it("private Storage dibatasi berdasarkan kepemilikan invoice", async () => {
    await db.query(
      "insert into storage.objects(bucket_id,name) values('invoice-pdfs',$1)",
      [`${invoice}/issued.pdf`],
    );
    expect(
      (await as(ids.sales, () => db.query("select * from storage.objects")))
        .rows,
    ).toHaveLength(1);
    expect(
      (await as(ids.other, () => db.query("select * from storage.objects")))
        .rows,
    ).toHaveLength(0);
  });
});
describe("Pembayaran dan audit", () => {
  const request = "30000000-0000-0000-0000-000000000001";
  it("Sales tidak boleh mencatat pembayaran", async () => {
    await expect(
      as(ids.sales, () =>
        rpc("record_payment", [
          invoice,
          request,
          "10000",
          "2020-01-01",
          "Transfer",
          "REF",
        ]),
      ),
    ).rejects.toThrow("Akses ditolak");
  });
  it("pembayaran parsial idempotent dan payload berbeda ditolak", async () => {
    payment = await as(ids.finance, () =>
      rpc<string>("record_payment", [
        invoice,
        request,
        "10000",
        "2020-01-01",
        "Transfer",
        "REF",
      ]),
    );
    expect(
      await as(ids.finance, () =>
        rpc("record_payment", [
          invoice,
          request,
          "10000",
          "2020-01-01",
          "Transfer",
          "REF",
        ]),
      ),
    ).toBe(payment);
    await expect(
      as(ids.finance, () =>
        rpc("record_payment", [
          invoice,
          request,
          "20000",
          "2020-01-01",
          "Transfer",
          "REF",
        ]),
      ),
    ).rejects.toThrow("data berbeda");
    expect(
      (
        await db.query<{ paid: string }>(
          "select paid from public.invoices where id=$1",
          [invoice],
        )
      ).rows[0].paid,
    ).toBe("10000.00");
  });
  it("menolak overpayment tanpa mengubah saldo", async () => {
    await expect(
      as(ids.finance, () =>
        rpc("record_payment", [
          invoice,
          "30000000-0000-0000-0000-000000000002",
          "999999999",
          "2020-01-01",
          "Tunai",
          "",
        ]),
      ),
    ).rejects.toThrow("melebihi sisa tagihan");
    expect(
      (
        await db.query<{ paid: string }>(
          "select paid from public.invoices where id=$1",
          [invoice],
        )
      ).rows[0].paid,
    ).toBe("10000.00");
  });
  it("invoice tidak dapat dibatalkan dengan pembayaran aktif", async () => {
    await expect(
      as(ids.sales, () =>
        rpc("cancel_invoice", [invoice, 2, "Pesanan dibatalkan"]),
      ),
    ).rejects.toThrow("Batalkan pembayaran aktif");
  });
  it("pembatalan payment mengembalikan saldo, menyimpan riwayat dan audit", async () => {
    await as(ids.finance, () =>
      rpc("cancel_payment", [payment, 1, "Transfer salah invoice"]),
    );
    await as(ids.finance, () =>
      rpc("cancel_payment", [payment, 1, "Transfer salah invoice"]),
    );
    expect(
      (
        await db.query<{ paid: string }>(
          "select paid from public.invoices where id=$1",
          [invoice],
        )
      ).rows[0].paid,
    ).toBe("0.00");
    const r = await db.query(
      "select * from public.audit_log where entity='payments' and action='cancel'",
    );
    expect(r.rows).toHaveLength(1);
  });
  it("pembayaran penuh mencapai lunas dan dashboard mengabaikan pembatalan", async () => {
    const { rows } = await db.query<{ total: string }>(
      "select total from public.invoices where id=$1",
      [invoice],
    );
    await as(ids.finance, () =>
      rpc("record_payment", [
        invoice,
        "30000000-0000-0000-0000-000000000003",
        rows[0].total,
        "2020-01-01",
        "Tunai",
        "FULL",
      ]),
    );
    const { rows: r } = await db.query<{ paid: string; total: string }>(
      "select paid,total from public.invoices where id=$1",
      [invoice],
    );
    expect(r[0].paid).toBe(r[0].total);
    const summary = await as(ids.other, () =>
      rpc<{ sales: string }>("dashboard_summary"),
    );
    expect(summary.sales).toBe("0");
  });
  it("Admin terakhir dilindungi dan RLS Finance dapat membaca invoice", async () => {
    await expect(
      as(ids.admin, () =>
        rpc("update_staff", [ids.admin, "Admin", "sales", false, 1]),
      ),
    ).rejects.toThrow("Admin aktif terakhir");
    expect(
      (await as(ids.finance, () => db.query("select * from public.invoices")))
        .rows.length,
    ).toBeGreaterThan(0);
    expect(
      (await as(ids.finance, () => db.query("select * from public.drafts")))
        .rows,
    ).toHaveLength(0);
  });
});

describe("Integritas tambahan", () => {
  it("konfirmasi rugi tidak bisa dipakai untuk input berbeda", async () => {
    const loss = {
      ...inputs,
      lines: [{ ...inputs.lines[0], selected_price: "10" }],
    };
    const p = await as(ids.sales, () =>
      rpc<{ hash: string }>("preview_draft", [loss]),
    );
    const changed = { ...loss, shipping: "30000" };
    await expect(
      as(ids.sales, () => rpc("save_draft", [changed, null, null, p.hash])),
    ).rejects.toThrow("Transaksi rugi");
  });
  it("Finance tidak boleh membatalkan invoice; Sales lain tidak dapat membaca snapshot", async () => {
    await expect(
      as(ids.finance, () =>
        rpc("cancel_invoice", [revisedInvoice, 1, "Alasan pembatalan"]),
      ),
    ).rejects.toThrow("Akses ditolak");
    const r = await as(ids.other, () =>
      db.query("select * from public.api_invoices where id=$1", [invoice]),
    );
    expect(r.rows).toHaveLength(0);
  });
  it("pembatalan invoice menyimpan alasan dan mengurangi dashboard", async () => {
    const before = await as(ids.sales, () =>
      rpc<{ sales: string; invoice_count: number }>("dashboard_summary"),
    );
    await expect(
      as(ids.sales, () =>
        rpc("cancel_invoice", [revisedInvoice, 99, "Dibatalkan pelanggan"]),
      ),
    ).rejects.toThrow("Invoice telah berubah");
    await as(ids.sales, () =>
      rpc("cancel_invoice", [revisedInvoice, 1, "Dibatalkan pelanggan"]),
    );
    const after = await as(ids.sales, () =>
      rpc<{ sales: string; invoice_count: number }>("dashboard_summary"),
    );
    expect(after.invoice_count).toBe(before.invoice_count - 1);
    expect(Number(after.sales)).toBeLessThan(Number(before.sales));
    const r = await db.query<{ cancellation_reason: string }>(
      "select cancellation_reason from public.invoices where id=$1",
      [revisedInvoice],
    );
    expect(r.rows[0].cancellation_reason).toBe("Dibatalkan pelanggan");
  });
  it("invoice dibatalkan tidak menerima pembayaran baru", async () => {
    await expect(
      as(ids.finance, () =>
        rpc("record_payment", [
          revisedInvoice,
          "30000000-0000-0000-0000-000000000009",
          "10",
          "2020-01-01",
          "Tunai",
          "",
        ]),
      ),
    ).rejects.toThrow("dibatalkan");
  });
  it("kegagalan insert invoice mengembalikan nomor urut dan tidak menerbitkan sebagian", async () => {
    const huge = {
      ...inputs,
      shipping: "0",
      lines: [
        {
          ...inputs.lines[0],
          quantity: "1000000",
          selected_price: "1000000000000",
        },
      ],
    };
    const d = await as(ids.sales, () => rpc<string>("save_draft", [huge]));
    const p = await as(ids.sales, () =>
      rpc<{ hash: string }>("preview_draft", [huge, d]),
    );
    const before = (
      await db.query<{ next_invoice: number }>(
        "select next_invoice from public.settings",
      )
    ).rows[0].next_invoice;
    await expect(
      as(ids.sales, () => rpc("issue_invoice", [d, 1, p.hash])),
    ).rejects.toThrow("numeric field overflow");
    expect(
      (
        await db.query<{ next_invoice: number }>(
          "select next_invoice from public.settings",
        )
      ).rows[0].next_invoice,
    ).toBe(before);
    expect(
      (await db.query("select * from public.invoices where draft_id=$1", [d]))
        .rows,
    ).toHaveLength(0);
  });
  it("view API mengembalikan uang sebagai teks dan menerapkan RLS", async () => {
    const r = await as(ids.finance, () =>
      db.query<{ total: string; paid: string }>(
        "select total,paid from public.api_invoices where id=$1",
        [invoice],
      ),
    );
    expect(typeof r.rows[0].total).toBe("string");
    expect(typeof r.rows[0].paid).toBe("string");
    const p = await as(ids.sales, () =>
      db.query<{ purchase_price: string }>(
        "select purchase_price from public.api_products where id=$1",
        [ids.product],
      ),
    );
    expect(typeof p.rows[0].purchase_price).toBe("string");
    expect(
      (
        await as(ids.inactive, () =>
          db.query("select * from public.api_products"),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("default persentase tidak valid ditolak pada pengaturan", async () => {
    const data = {
      company_name: "Perusahaan",
      address: "",
      contact: "",
      logo_path: null,
      tax_percent: "0",
      profit_percent: "20",
      marketing_percent: "40",
      operational_percent: "50",
      invoice_prefix: "INV",
    };
    await expect(
      as(ids.admin, () => rpc("save_settings", [data, 1])),
    ).rejects.toThrow("penyebut harus lebih besar dari nol");
  });
});
