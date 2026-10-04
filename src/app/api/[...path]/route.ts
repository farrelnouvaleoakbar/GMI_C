import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireStaff, HttpError, checkError } from "@/lib/auth";
import { serverClient, adminClient } from "@/lib/supabase";
import { recommendTransactionPrices } from "@/lib/pricing";
import { ensureInvoicePDF } from "@/lib/private-pdf";
import { invoicePDF } from "@/lib/pdf";
import type { DraftInput, Invoice, Product, Settings } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const version = z.number().int().positive();
const decimal = z
  .string()
  .regex(
    /^\d{1,13}(\.\d{1,8})?$/,
    "Gunakan angka positif tanpa pemisah ribuan.",
  );
const inputsSchema = z.object({
  customer_id: uuid,
  shipping: decimal.nullable().optional(),
  due_date: z.iso.date(),
  notes: z.string().max(2000),
  shipping_address: z.string().max(1000).optional(),
  shipping_carrier: z.string().max(200).optional(),
  target_percent: decimal.optional(),
  marketing_percent: decimal.optional(),
  invoice_date: z.iso.date().optional(),
  operations: z.array(z.object({ name: z.string().min(1).max(100), percent: decimal })).max(30).optional(),
  tax: z.object({
    enabled: z.boolean(), name: z.string().max(100), rate: decimal,
    mode: z.enum(["added", "included"]), base: z.enum(["products", "products_shipping"]),
  }).optional(),
  lines: z
    .array(
      z.object({
        product_id: uuid,
        quantity: decimal,
        profit_percent: decimal,
        marketing_percent: decimal,
        operational_percent: decimal,
        rounding: z.enum(["0", "100", "500", "1000"]),
        selected_price: decimal.nullable(),
        client_line_id: uuid.optional(),
      }),
    )
    .min(1)
    .max(100),
});
const draftSchema = z.object({
  inputs: inputsSchema,
  draft_id: uuid.nullable().optional(),
  expected_version: version.nullable().optional(),
  loss_confirmation: z.string().nullable().optional(),
  revision_of: uuid.nullable().optional(),
});
function json(value: unknown) {
  return NextResponse.json(value, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
function fail(error: unknown) {
  if (error instanceof z.ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Terjadi kesalahan." },
    { status: error instanceof HttpError ? error.status : 500 },
  );
}
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (
    origin &&
    origin !== req.nextUrl.origin &&
    origin !== process.env.NEXT_PUBLIC_APP_URL
  )
    throw new HttpError(403, "Origin permintaan tidak valid.");
}
async function decimalCheck(
  db: Awaited<ReturnType<typeof serverClient>>,
  inputs: DraftInput,
) {
  // Stored purchase prices only. Client-submitted B, totals, and tax are never accepted.
  const { data: products, error } = await db
    .from("api_products")
    .select("*")
    .in(
      "id",
      inputs.lines.map((l) => l.product_id),
    );
  checkError(error);
  const { data: settings, error: err } = await db
    .from("api_settings")
    .select("*")
    .single();
  checkError(err);
  const resolved = inputs.lines.map((l) => {
    const p = (products as Product[]).find((p) => p.id === l.product_id);
    if (!p || p.archived) throw new HttpError(400, "Produk tidak tersedia.");
    return { cost: p.purchase_price ?? "0", quantity: l.quantity, manual: l.selected_price, rounding: l.rounding };
  });
  const first = inputs.lines[0];
  const settingsRow = settings as Settings;
  recommendTransactionPrices({
    lines: resolved,
    shipping: inputs.shipping ?? null,
    targetPercent: inputs.target_percent ?? first.profit_percent,
    marketingPercent: inputs.marketing_percent ?? first.marketing_percent,
    operations: inputs.operations !== undefined ? inputs.operations : [{ name: "Operasional", percent: first.operational_percent }],
    tax: inputs.tax ?? {
      enabled: settingsRow.tax_enabled ?? Number(settingsRow.tax_percent) > 0,
      name: settingsRow.tax_name ?? "PPN",
      rate: settingsRow.tax_percent,
      mode: settingsRow.tax_mode ?? "added",
      base: settingsRow.tax_base ?? "products_shipping",
    },
  });
}
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await context.params).path;
    const { db, profile } = await requireStaff();
    if (path[0] === "me") return json(profile);
    if (path[0] === "dashboard") {
      const { data, error } = await db.rpc("dashboard_summary");
      checkError(error);
      return json(data);
    }
    if (path[0] === "list") {
      const table = z
        .enum([
          "products",
          "customers",
          "drafts",
          "invoices",
          "payments",
          "settings",
          "profiles",
          "operational_categories",
          "audit_log",
        ])
        .parse(path[1]);
      if (["profiles", "audit_log"].includes(table) && profile.role !== "admin")
        throw new HttpError(403, "Akses ditolak.");
      if (table === "drafts" && profile.role === "finance")
        throw new HttpError(403, "Akses ditolak.");
      const page = Math.max(
        0,
        Number(req.nextUrl.searchParams.get("page") || 0),
      );
      if (!Number.isSafeInteger(page))
        throw new HttpError(400, "Halaman tidak valid.");
      let query = db
        .from(
          table === "drafts"
            ? "open_drafts"
            : ["products", "invoices", "payments", "settings"].includes(table)
              ? `api_${table}`
              : table,
        )
        .select("*", { count: "exact" });
      const search = req.nextUrl.searchParams
        .get("q")
        ?.replace(/[%_,()"\\]/g, "")
        .slice(0, 100);
      if (search) {
        if (table === "products")
          query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,brand.ilike.%${search}%,variant.ilike.%${search}%`);
        else if (
          ["customers", "profiles", "operational_categories"].includes(table)
        )
          query = query.ilike("name", `%${search}%`);
        else if (table === "invoices")
          query = query.or(
            `number.ilike.%${search}%,snapshot->customer->>name.ilike.%${search}%`,
          );
        else if (table === "drafts")
          query = query.ilike("calculation->customer->>name", `%${search}%`);
        else if (table === "payments")
          query = query.or(
            `method.ilike.%${search}%,reference.ilike.%${search}%`,
          );
        else if (table === "audit_log")
          query = query.or(`action.ilike.%${search}%,entity.ilike.%${search}%`);
      }
      if (req.nextUrl.searchParams.get("invoice_id") && table === "payments")
        query = query.eq(
          "invoice_id",
          uuid.parse(req.nextUrl.searchParams.get("invoice_id")),
        );
      if (
        ["products", "customers", "operational_categories"].includes(table) &&
        req.nextUrl.searchParams.get("active") === "1"
      )
        query = query.eq("archived", false);
      const sort = [
        "products",
        "customers",
        "profiles",
        "operational_categories",
      ].includes(table)
        ? "name"
        : table === "settings"
          ? "id"
          : table === "drafts"
            ? "updated_at"
            : table === "invoices"
              ? "issued_at"
              : "created_at";
      const { data, error, count } = await query
        .order(sort, { ascending: ["name", "id"].includes(sort) })
        .order("id", { ascending: true })
        .range(page * 50, page * 50 + 49);
      checkError(error);
      return json({ data, count, page });
    }
    if (path[0] === "draft" && path[1]) {
      if (profile.role === "finance")
        throw new HttpError(403, "Akses ditolak.");
      const { data, error } = await db
        .from("drafts")
        .select("*")
        .eq("id", uuid.parse(path[1]))
        .single();
      checkError(error);
      if (!data) throw new HttpError(404, "Draf tidak ditemukan.");
      if (path[2] === "pdf") {
        const { data: issued, error: issuedError } = await db
          .from("invoices")
          .select("id")
          .eq("draft_id", data.id)
          .maybeSingle();
        checkError(issuedError);
        if (issued) throw new HttpError(409, "Draf ini sudah diterbitkan. Unduh PDF dari detail invoice.");
        const snapshot = data.calculation as Invoice["snapshot"];
        const draftInvoice: Invoice = {
          id: data.id,
          draft_id: data.id,
          owner_id: data.owner_id,
          number: `DRAF-${data.id.slice(0, 8).toUpperCase()}`,
          snapshot,
          total: snapshot.total,
          paid: "0",
          revision_of: data.revision_of,
          issued_at: data.updated_at,
          cancelled_at: null,
          cancellation_reason: null,
          version: data.version,
        };
        let logo: Uint8Array | undefined;
        const logoPath = snapshot.company.logo_path;
        if (logoPath === "brand:gmi-logo") {
          logo = new Uint8Array(await readFile(join(process.cwd(), "public/brand/gmi-logo.png")));
        } else if (logoPath) {
          const { data: logoFile, error: logoError } = await adminClient()
            .storage.from("company-assets").download(logoPath);
          checkError(logoError);
          if (logoFile) logo = new Uint8Array(await logoFile.arrayBuffer());
        }
        const bytes = await invoicePDF(draftInvoice, logo, "draft");
        const body = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(body).set(bytes);
        return new NextResponse(body, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${draftInvoice.number}.pdf"`,
            "Cache-Control": "private, no-store",
          },
        });
      }
      return json(data);
    }
    if (path[0] === "invoice" && path[1]) {
      const { data: invoice, error } = await db
        .from("api_invoices")
        .select("*")
        .eq("id", uuid.parse(path[1]))
        .single();
      checkError(error);
      if (!invoice) throw new HttpError(404, "Invoice tidak ditemukan.");
      if (path[2] !== "pdf") return json(invoice);
      const stored = await ensureInvoicePDF(invoice as Invoice);
      return new NextResponse(await stored.arrayBuffer(), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${invoice.number.replaceAll("/", "-")}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    throw new HttpError(404, "Tidak ditemukan.");
  } catch (error) {
    return fail(error);
  }
}
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    sameOrigin(req);
    const path = (await context.params).path;
    if (path[0] === "login") {
      const body = z
        .object({ email: z.email(), password: z.string().min(1).max(200) })
        .parse(await req.json());
      const db = await serverClient();
      const { error } = await db.auth.signInWithPassword(body);
      if (error) throw new HttpError(401, "Email atau kata sandi salah.");
      try {
        await requireStaff();
      } catch (error) {
        await db.auth.signOut();
        throw error;
      }
      return json({ ok: true });
    }
    if (path[0] === "logout") {
      const db = await serverClient();
      await db.auth.signOut();
      return json({ ok: true });
    }
    const { db, profile } = await requireStaff();
    if (path[0] === "logo") {
      if (profile.role !== "admin")
        throw new HttpError(403, "Hanya Admin dapat mengunggah logo.");
      const form = await req.formData();
      const file = form.get("file");
      if (
        !(file instanceof File) ||
        !["image/png", "image/jpeg"].includes(file.type) ||
        file.size > 2097152
      )
        throw new HttpError(400, "Gunakan PNG/JPEG maksimal 2 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const valid =
        file.type === "image/png"
          ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78
          : bytes[0] === 255 && bytes[1] === 216;
      if (!valid) throw new HttpError(400, "Isi file bukan gambar yang valid.");
      const key = `${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
      const { error } = await adminClient()
        .storage.from("company-assets")
        .upload(key, bytes, { contentType: file.type });
      checkError(error);
      return json({ path: key });
    }
    const body = await req.json();
    let result: {
      data: unknown;
      error: { message: string; code?: string } | null;
    };
    if (path[0] === "master") {
      const input = z
        .object({
          kind: z.enum(["products", "customers", "operational_categories"]),
          data: z.record(z.string(), z.unknown()),
          record_id: uuid.nullable().optional(),
          expected_version: version.nullable().optional(),
        })
        .parse(body);
      if (input.kind === "customers") {
        if (!["admin", "sales"].includes(profile.role))
          throw new HttpError(403, "Akses ditolak.");
      } else if (profile.role !== "admin")
        throw new HttpError(403, "Akses ditolak.");
      result = input.kind === "products"
        ? await db.rpc("save_product", { data: input.data, record_id: input.record_id ?? null, expected_version: input.expected_version ?? null })
        : await db.rpc("save_master", input);
    } else if (path[0] === "settings") {
      if (profile.role !== "admin") throw new HttpError(403, "Akses ditolak.");
      const input = z
        .object({
          data: z.object({
            company_name: z.string().min(1).max(200),
            address: z.string().max(1000),
            contact: z.string().max(500),
            logo_path: z
              .string()
              .regex(/^[a-f0-9-]+\.(png|jpg)$/)
              .or(z.literal("brand:gmi-logo"))
              .nullable(),
            tax_percent: decimal,
            tax_enabled: z.boolean(),
            tax_name: z.string().min(1).max(100),
            tax_mode: z.enum(["added", "included"]),
            tax_base: z.enum(["products", "products_shipping"]),
            profit_percent: decimal,
            marketing_percent: decimal,
            operational_percent: decimal,
            invoice_prefix: z.string().regex(/^[A-Z0-9-]{1,16}$/),
          }),
          expected_version: version,
        })
        .parse(body);
      result = await db.rpc("save_settings", input);
    } else if (path[0] === "staff") {
      if (profile.role !== "admin") throw new HttpError(403, "Akses ditolak.");
      if (path[1] === "create") {
        const input = z
          .object({
            email: z.email(),
            name: z.string().min(1).max(200),
            password: z.string().min(12).max(128),
          })
          .parse(body);
        const { data, error } = await adminClient().auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { name: input.name },
        });
        checkError(error);
        // New profile is inactive; activation is a separate audited RPC.
        if (data.user) {
          const logged = await db.rpc("audit_staff_created", {
            staff_id: data.user.id,
          });
          checkError(logged.error);
        }
        return json({ id: data.user?.id });
      }
      result = await db.rpc(
        "update_staff",
        z
          .object({
            staff_id: uuid,
            staff_name: z.string().min(1).max(200),
            staff_role: z.enum(["admin", "sales", "finance"]),
            staff_active: z.boolean(),
            expected_version: version,
          })
          .parse(body),
      );
    } else if (path[0] === "password") {
      const input = z
        .object({ password: z.string().min(12).max(128) })
        .parse(body);
      const { error } = await db.auth.updateUser({ password: input.password });
      checkError(error);
      return json({ ok: true });
    } else if (path[0] === "preview" || path[0] === "draft") {
      if (!["admin", "sales"].includes(profile.role))
        throw new HttpError(403, "Akses ditolak.");
      if (path[1] === "delete") {
        result = await db.rpc(
          "delete_draft",
          z.object({ draft_id: uuid, expected_version: version }).parse(body),
        );
      } else {
        const input = draftSchema.parse(body);
        await decimalCheck(db, input.inputs);
        result =
          path[0] === "preview"
            ? await db.rpc("preview_draft", {
                inputs: input.inputs,
                draft_id: input.draft_id ?? null,
              })
            : await db.rpc("save_draft", input);
      }
    } else if (path[0] === "issue") {
      if (!["admin", "sales"].includes(profile.role))
        throw new HttpError(403, "Akses ditolak.");
      result = await db.rpc(
        "issue_invoice",
        z
          .object({
            draft_id: uuid,
            expected_version: version,
            reviewed_hash: z.string().length(64),
            loss_confirmation: z.string().nullable().optional(),
          })
          .parse(body),
      );
    } else if (path[0] === "payment") {
      if (!["admin", "finance"].includes(profile.role))
        throw new HttpError(403, "Akses ditolak.");
      result =
        path[1] === "cancel"
          ? await db.rpc(
              "cancel_payment",
              z
                .object({
                  payment_id: uuid,
                  expected_version: version,
                  reason: z.string().min(5).max(1000),
                })
                .parse(body),
            )
          : await db.rpc(
              "record_payment",
              z
                .object({
                  invoice_id: uuid,
                  request_id: uuid,
                  amount: decimal,
                  paid_on: z.iso.date(),
                  method: z.string().min(1).max(100),
                  reference: z.string().max(200),
                })
                .parse(body),
            );
    } else if (path[0] === "invoice" && path[1] === "cancel") {
      if (!["admin", "sales"].includes(profile.role))
        throw new HttpError(403, "Akses ditolak.");
      result = await db.rpc(
        "cancel_invoice",
        z
          .object({
            invoice_id: uuid,
            expected_version: version,
            reason: z.string().min(5).max(1000),
          })
          .parse(body),
      );
    } else throw new HttpError(404, "Tidak ditemukan.");
    checkError(result.error);
    if (path[0] === "issue") {
      const { data: invoice, error } = await db
        .from("api_invoices")
        .select("*")
        .eq("id", String(result.data))
        .single();
      checkError(error);
      try {
        await ensureInvoicePDF(invoice as Invoice);
      } catch {
        return json({
          data: result.data,
          pdf_error:
            "Invoice sudah terbit; PDF belum tersimpan. Coba unduh kembali dari halaman invoice.",
        });
      }
    }
    return json({ data: result.data });
  } catch (error) {
    return fail(error);
  }
}
