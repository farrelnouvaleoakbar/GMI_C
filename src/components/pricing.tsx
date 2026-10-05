"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Calculator,
  Save,
  ArrowRight,
  Info,
  Check,
} from "lucide-react";
import Decimal from "decimal.js";
import type {
  DraftInput,
  LineInput,
  Product,
  Customer,
  Settings,
  Preview,
  Draft,
  Invoice,
  Category,
} from "@/lib/types";
import { rupiah } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { ConfirmDialog } from "./ui/alert-dialog";
import { Field, api, useData, DataState, type Notify } from "./data";
const defaultLine = (s?: Settings): LineInput => ({
  client_line_id: crypto.randomUUID(),
  product_id: "",
  quantity: "1",
  profit_percent: String(s?.profit_percent ?? 20),
  marketing_percent: String(s?.marketing_percent ?? 5),
  operational_percent: String(s?.operational_percent ?? 10),
  rounding: "100",
  selected_price: null,
});
function jakartaDate(addDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((x) => x.type === "year")?.value);
  const month = Number(parts.find((x) => x.type === "month")?.value);
  const day = Number(parts.find((x) => x.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day + addDays)).toISOString().slice(0, 10);
}
export function PricingView({ notify }: { notify: Notify }) {
  const router = useRouter();
  const settings = useData<{ data: Settings[] }>("list/settings");
  const [products, setProducts] = useState<Product[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [masterError, setMasterError] = useState(""),
    [loading, setLoading] = useState(true);
  const [calculationError, setCalculationError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const [inputs, setInputs] = useState<DraftInput>({
      customer_id: "",
      shipping: null,
      invoice_date: jakartaDate(),
      due_date: jakartaDate(14),
      notes: "",
      lines: [defaultLine()],
    }),
    [draft, setDraft] = useState<Draft | null>(null),
    [revision, setRevision] = useState<string | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<"save" | "issue" | null>(null);
  useEffect(() => {
    let live = true;
    async function loadAll<T>(table: string) {
      const rows: T[] = [];
      let page = 0;
      for (;;) {
        const res = await api<{ data: T[]; count: number }>(
          `list/${table}?active=1&page=${page}`,
        );
        rows.push(...res.data);
        if (rows.length >= res.count) break;
        page++;
      }
      // Keep pagination resilient if a tied sort value shifts across page boundaries.
      const unique = new Map<string, T>();
      for (const row of rows) {
        const id = (row as { id?: unknown }).id;
        if (typeof id === "string") unique.set(id, row);
      }
      return [...unique.values()];
    }
    Promise.all([
      loadAll<Product>("products"),
      loadAll<Customer>("customers"),
      loadAll<Category>("operational_categories"),
      api<{ data: Settings[] }>("list/settings"),
    ])
      .then(async ([p, c, categoryRows, s]) => {
        if (!live) return;
        setProducts(p);
        setCustomers(c);
        setCategories(categoryRows);
        const params = new URLSearchParams(location.search);
        if (params.get("draft")) {
          const d = await api<Draft>(`draft/${params.get("draft")}`);
          if (live) {
            setDraft(d);
            setInputs(d.inputs);
            setRevision(d.revision_of);
          }
        } else if (params.get("duplicate")) {
          const i = await api<Invoice>(`invoice/${params.get("duplicate")}`);
          const original = await api<Draft>(`draft/${i.draft_id}`);
          if (live) {
            setInputs({
              ...original.inputs,
              invoice_date: jakartaDate(),
              due_date: jakartaDate(14),
            });
            if (params.get("revision") === "1") setRevision(i.id);
          }
        } else {
          setInputs((prev) => ({
            ...prev,
            tax: {
              enabled: s.data[0].tax_enabled ?? Number(s.data[0].tax_percent) > 0,
              name: s.data[0].tax_name ?? "PPN",
              rate: s.data[0].tax_percent,
              mode: s.data[0].tax_mode ?? "added",
              base: s.data[0].tax_base ?? "products_shipping",
            },
            target_percent: s.data[0].profit_percent,
            marketing_percent: s.data[0].marketing_percent,
            lines: [defaultLine(s.data[0])],
          }));
        }
      })
      .catch((e) => {
        if (live) setMasterError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (preview) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [preview]);
  function change(next: DraftInput) {
    setInputs(next);
    setPreview(null);
    setCalculationError("");
  }
  function lineChange(index: number, patch: Partial<LineInput>) {
    change({
      ...inputs,
      lines: inputs.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    });
  }
  async function calculate() {
    setCalculationError("");
    if (!inputs.customer_id) {
      setCalculationError("Pilih pelanggan sebelum menghitung harga.");
      return;
    }
    if (inputs.lines.some((line) => !line.product_id)) {
      setCalculationError("Pilih produk untuk setiap baris sebelum menghitung harga.");
      return;
    }
    setBusy(true);
    try {
      const response = await api<{ data: Preview }>("preview", {
        inputs,
        draft_id: draft?.id ?? null,
      });
      const p = response.data;
      if (!p?.calculation || !p.hash) {
        throw new Error("Perhitungan selesai, tetapi hasil tidak diterima. Silakan coba lagi.");
      }
      setPreview(p);
      notify("Perhitungan server berhasil. Tinjau harga sebelum menyimpan.");
    } catch (e) {
      setPreview(null);
      const message = (e as Error).message || "Perhitungan gagal. Coba lagi.";
      setCalculationError(message);
      notify(message, true);
    } finally {
      setBusy(false);
    }
  }
  async function save(confirmed = false) {
    if (!preview) return;
    if (new Decimal(preview.calculation.profit).lt(0) && !confirmed) {
      setConfirm("save");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ data: string }>("draft", {
        inputs,
        draft_id: draft?.id ?? null,
        expected_version: draft?.version ?? null,
        loss_confirmation: confirmed ? preview.hash : null,
        revision_of: revision,
      });
      const saved = await api<Draft>(`draft/${res.data}`);
      setDraft(saved);
      setPreview({
        calculation: saved.calculation,
        hash: saved.calculation_hash,
        version: saved.version,
      });
      history.replaceState(null, "", `/pricing?draft=${saved.id}`);
      notify(
        "Draf berhasil disimpan. Tinjau pratinjau pelanggan sebelum menerbitkan.",
      );
    } catch (e) {
      notify((e as Error).message, true);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  async function issue(confirmed = false) {
    if (!draft || !preview) return;
    if (!confirmed) {
      setConfirm("issue");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ data: string; pdf_error?: string }>("issue", {
        draft_id: draft.id,
        expected_version: draft.version,
        reviewed_hash: preview.hash,
        loss_confirmation: new Decimal(preview.calculation.profit).lt(0)
          ? preview.hash
          : null,
      });
      router.push(
        `/invoices?id=${res.data}${res.pdf_error ? "&pdf=retry" : ""}`,
      );
      router.refresh();
    } catch (e) {
      notify((e as Error).message, true);
      setPreview(null);
      setBusy(false);
    }
  }
  const c = preview?.calculation;
  const draftCurrent = !!draft && draft.calculation_hash === preview?.hash;
  const workflow = [
    { label: "Isi transaksi", complete: false },
    { label: "Hitung & tinjau", complete: !!preview },
    { label: "Simpan draf", complete: draftCurrent },
    { label: "Terbitkan invoice", complete: false },
  ];
  const taxInput = inputs.tax ?? { enabled: false, name: "PPN", rate: "0", mode: "added" as const, base: "products_shipping" as const };
  return (
    <DataState
      loading={loading || settings.loading}
      error={masterError || settings.error}
    >
      <div className="space-y-6">
        <ol aria-label="Tahapan transaksi" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {workflow.map((step, index) => {
            const active = index === 0 ? !preview : index === 2 ? !!preview && !draftCurrent : index === 3 ? draftCurrent : false;
            return (
              <li key={step.label} className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-xs ${step.complete ? "border-primary/25 bg-[#e9f3ef] text-primary" : active ? "border-primary bg-white font-semibold text-primary shadow-sm" : "border-border bg-white text-muted-foreground"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${step.complete ? "bg-primary text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                  {step.complete ? <Check size={13} /> : index + 1}
                </span>
                <span>{step.label}</span>
              </li>
            );
          })}
        </ol>
        {revision && (
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            Revisi terhubung ke invoice asal. Penerbitan revisi tidak
            membatalkan invoice asal.
          </div>
        )}
        {(!products.length || !customers.length) && (
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            Tambahkan produk dan pelanggan aktif sebelum membuat transaksi.
          </div>
        )}
        <Card className="p-6">
          <h2 className="mb-5 flex items-center gap-2 font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-white">
              1
            </span>
            Informasi transaksi
            {draft && (
              <span className="ml-auto text-xs text-muted-foreground">
                Draf • versi {draft.version}
              </span>
            )}
          </h2>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Pelanggan" id="customer">
              <select
                id="customer"
                value={inputs.customer_id}
                onChange={(e) =>
                  change({ ...inputs, customer_id: e.target.value })
                }
              >
                <option value="">Pilih pelanggan</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ongkir seluruh pesanan (Rp)" id="shipping">
              <Input
                id="shipping"
                type="number"
                min="0"
                step="0.01"
                value={inputs.shipping ?? ""}
                onChange={(e) =>
                  change({ ...inputs, shipping: e.target.value === "" ? null : e.target.value })
                }
              />
            </Field>
            <Field label="Tanggal invoice" id="invoice-date">
              <Input id="invoice-date" type="date" value={inputs.invoice_date ?? jakartaDate()} onChange={(e) => change({ ...inputs, invoice_date: e.target.value, due_date: inputs.due_date < e.target.value ? e.target.value : inputs.due_date })} />
            </Field>
            <Field label="Tanggal jatuh tempo" id="due">
              <Input
                id="due"
                type="date"
                min={inputs.invoice_date ?? jakartaDate()}
                value={inputs.due_date}
                onChange={(e) =>
                  change({ ...inputs, due_date: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Alamat pengiriman" id="shipping-address">
              <Input id="shipping-address" value={inputs.shipping_address ?? ""} onChange={(e) => change({ ...inputs, shipping_address: e.target.value })} maxLength={1000} />
            </Field>
            <Field label="Kurir / layanan pengiriman" id="shipping-carrier">
              <Input id="shipping-carrier" value={inputs.shipping_carrier ?? ""} onChange={(e) => change({ ...inputs, shipping_carrier: e.target.value })} maxLength={200} />
            </Field>
          </div>
          {inputs.shipping === null && <p className="mt-3 text-sm font-medium text-amber-700">Belum termasuk ongkir — hasil sementara</p>}
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <Info size={15} className="mt-0.5 shrink-0" />
            Ongkir dibagi sama per unit di seluruh baris, lalu ditagihkan sekali
            secara terpisah. Harga jual barang tidak mencakup ongkir dan pajak.
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Biaya operasional dan pajak</h2>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Target keuntungan (%)" id="target-percent"><Input id="target-percent" type="number" min="0" max="1000" step="0.01" value={inputs.target_percent ?? inputs.lines[0]?.profit_percent ?? "20"} onChange={(e) => change({ ...inputs, target_percent: e.target.value })} /></Field>
            <Field label="Biaya pemasaran (%)" id="marketing-percent"><Input id="marketing-percent" type="number" min="0" max="100" step="0.01" value={inputs.marketing_percent ?? inputs.lines[0]?.marketing_percent ?? "5"} onChange={(e) => change({ ...inputs, marketing_percent: e.target.value })} /></Field>
            {inputs.operations == null && <Field label="Biaya operasional (%)" id="operational-percent"><Input id="operational-percent" type="number" min="0" max="100" step="0.01" value={inputs.lines[0]?.operational_percent ?? "0"} onChange={(e) => change({ ...inputs, lines: inputs.lines.map((line) => ({ ...line, operational_percent: e.target.value })) })} /></Field>}
          </div>
          <div className="space-y-3">
            {(inputs.operations ?? []).map((op, i) => (
              <div key={op.name} className="grid items-end gap-3 sm:grid-cols-[1fr_180px_auto]">
                <p className="pb-2 text-sm">{op.name}</p>
                <Field label={`Persentase ${op.name}`} id={`operation-${i}`}>
                  <Input id={`operation-${i}`} type="number" min="0" max="100" step="0.01" value={op.percent} onChange={(e) => change({ ...inputs, operations: inputs.operations?.map((x, n) => n === i ? { ...x, percent: e.target.value } : x) })} />
                </Field>
                <Button type="button" variant="ghost" aria-label={`Hapus ${op.name}`} onClick={() => { const remaining = inputs.operations?.filter((_, n) => n !== i) ?? []; change({ ...inputs, operations: remaining.length ? remaining : undefined }); }}><Trash2 size={16} /></Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {categories.filter((x) => !x.archived && !(inputs.operations ?? []).some((op) => op.name === x.name)).map((x) => <Button key={x.id} type="button" size="sm" variant="outline" onClick={() => change({ ...inputs, operations: [...(inputs.operations ?? []), { name: x.name, percent: "0" }] })}><Plus size={14} />{x.name}</Button>)}
            </div>
            {inputs.operations != null && <Button type="button" size="sm" variant="outline" onClick={() => change({ ...inputs, operations: undefined })}>Gunakan tarif operasional umum</Button>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Persentase operasional umum memakai default pengaturan. Jika kategori dipilih, persentase kategori menjadi pengganti biaya umum dan dihitung satu per satu.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={taxInput.enabled} onChange={(e) => change({ ...inputs, tax: { ...taxInput, enabled: e.target.checked } })} />Aktifkan pajak</label>
            {taxInput.enabled && <>
              <Field label="Nama pajak" id="tax-name"><Input id="tax-name" value={taxInput.name} onChange={(e) => change({ ...inputs, tax: { ...taxInput, name: e.target.value } })} /></Field>
              <Field label="Tarif pajak (%)" id="tax-rate"><Input id="tax-rate" type="number" min="0" max="100" step="0.01" value={taxInput.rate} onChange={(e) => change({ ...inputs, tax: { ...taxInput, rate: e.target.value } })} /></Field>
              <Field label="Perlakuan pajak" id="tax-mode"><select id="tax-mode" value={taxInput.mode} onChange={(e) => change({ ...inputs, tax: { ...taxInput, mode: e.target.value as "added" | "included" } })}><option value="added">Ditambahkan ke harga</option><option value="included">Termasuk harga</option></select></Field>
              <Field label="Dasar pajak" id="tax-base"><select id="tax-base" value={taxInput.base} onChange={(e) => change({ ...inputs, tax: { ...taxInput, base: e.target.value as "products" | "products_shipping" } })}><option value="products">Produk saja</option><option value="products_shipping">Produk dan ongkir</option></select></Field>
            </>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Pajak dipisahkan dari profit. Kategori operasional dihitung satu per satu dari pendapatan produk sebelum pajak.</p>
        </Card>
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-white">
                2
              </span>
              Produk & harga
            </h2>
            <Button
              variant="outline"
              size="sm"
              disabled={inputs.lines.length >= 100}
              onClick={() =>
                change({
                  ...inputs,
                  lines: [...inputs.lines, defaultLine(settings.data?.data[0])],
                })
              }
            >
              <Plus size={14} />
              Tambah baris
            </Button>
          </div>
          <div className="space-y-5">
            {inputs.lines.map((l, i) => {
              const prod = products.find((p) => p.id === l.product_id);
              return (
                <div
                  key={l.client_line_id ?? `${l.product_id}-${i}`}
                  className="rounded-lg border border-border bg-[#fafcfc] p-4"
                >
                  <div className="grid items-end gap-3 md:grid-cols-[3fr_1fr_2fr_auto]">
                    <Field label={`Produk ${i + 1}`} id={`product-${i}`}>
                      <select
                        id={`product-${i}`}
                        value={l.product_id}
                        onChange={(e) =>
                          lineChange(i, { product_id: e.target.value })
                        }
                      >
                        <option value="">Pilih produk</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.brand ? `${p.brand} · ` : ""}{p.name}{p.variant ? ` (${p.variant})` : ""}{p.category.toLowerCase().includes("estimasi modal") ? " · ESTIMASI MODAL" : p.category.toLowerCase().includes("supplier siny 2024") ? " · HARGA SINY 2024, CEK" : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Jumlah" id={`quantity-${i}`}>
                      <Input
                        id={`quantity-${i}`}
                        type="number"
                        min="1"
                        step="1"
                        value={l.quantity}
                        onChange={(e) =>
                          lineChange(i, { quantity: e.target.value })
                        }
                      />
                    </Field>
                    <div>
                      <p className="mb-[7px] text-xs font-semibold text-[#536773]">
                        {prod?.category.toLowerCase().includes("estimasi modal") ? "Estimasi modal / unit" : prod?.category.toLowerCase().includes("supplier siny 2024") ? "Modal supplier 2024 / unit" : "Modal / unit"}
                      </p>
                      <p className="flex h-10 items-center text-sm font-semibold">
                        {prod?.purchase_price ? rupiah(prod.purchase_price) : prod ? "Modal aktual belum diisi" : "—"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Hapus baris ${i + 1}`}
                      disabled={inputs.lines.length === 1}
                      onClick={() =>
                        change({
                          ...inputs,
                          lines: inputs.lines.filter((_, idx) => idx !== i),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <Field label="Bulatkan harga ke atas" id={`rounding-${i}`}>
                      <select
                        id={`rounding-${i}`}
                        value={l.rounding}
                        onChange={(e) =>
                          lineChange(i, { rounding: e.target.value })
                        }
                      >
                        <option value="0">Dua desimal</option>
                        <option value="100">Rp100</option>
                        <option value="500">Rp500</option>
                        <option value="1000">Rp1.000</option>
                      </select>
                    </Field>
                    <Field
                      label="Harga manual / unit (opsional)"
                      id={`manual-${i}`}
                    >
                      <Input
                        id={`manual-${i}`}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Gunakan rekomendasi"
                        value={l.selected_price ?? ""}
                        onChange={(e) =>
                          lineChange(i, {
                            selected_price: e.target.value || null,
                          })
                        }
                      />
                      {l.selected_price !== null && <Button type="button" size="sm" variant="ghost" onClick={() => lineChange(i, { selected_price: null })}>Kembali ke rekomendasi</Button>}
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5">
            <Field label="Catatan untuk pelanggan" id="notes">
              <textarea
                id="notes"
                rows={2}
                maxLength={2000}
                value={inputs.notes}
                onChange={(e) => change({ ...inputs, notes: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[11px] text-muted-foreground">
              P = [B × (1 + p) + p × S] / [1 − m − o × (1 + p)]
            </p>
            <Button disabled={busy || !inputs.customer_id} aria-describedby="calculate-help" onClick={calculate}>
              <Calculator size={16} />
              {busy ? "Memproses…" : "Hitung harga"}
            </Button>
          </div>
          {calculationError ? (
            <p id="calculate-help" role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-destructive">{calculationError}</p>
          ) : !inputs.customer_id ? (
            <p id="calculate-help" className="mt-3 text-sm text-muted-foreground">Pilih pelanggan agar tombol Hitung harga aktif.</p>
          ) : inputs.lines.some((line) => !line.product_id) ? (
            <p id="calculate-help" className="mt-3 text-sm text-muted-foreground">Pilih produk pada setiap baris untuk menghitung.</p>
          ) : null}
          {c && (
            <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p>{draftCurrent ? <>Draf tersimpan (versi {draft.version}). Tinjau pratinjau pelanggan di bawah sebelum menerbitkan.</> : draft ? <>Hasil terbaru belum disimpan ke draf versi {draft.version}. Simpan perubahan sebelum menerbitkan.</> : <>Hasil perhitungan siap, tetapi belum tersimpan. Simpan sebagai draf agar dapat dibuka kembali.</>}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  Lihat hasil
                  <ArrowRight size={15} />
                </Button>
                <Button type="button" size="sm" disabled={busy || draftCurrent} onClick={() => void save()}>
                  <Save size={15} />
                  {draftCurrent ? "Draf tersimpan" : draft ? "Simpan perubahan" : "Simpan draf"}
                </Button>
                {draft && <Button asChild type="button" size="sm" variant="outline"><Link href="/drafts">Daftar draf</Link></Button>}
              </div>
            </div>
          )}
        </Card>
        {c && (
          <div id="hasil-perhitungan" ref={resultRef} tabIndex={-1} className="scroll-mt-6 focus:outline-none">
            <Card className="overflow-hidden">
              <div className="p-6">
                <h2 className="font-semibold">Hasil perhitungan internal</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Modal diambil dari katalog. Semua persentase dikonversi
                  menjadi tarif desimal.
                </p>
                <p className="mt-3 text-sm">{draftCurrent ? `Draf tersimpan • versi ${draft.version}.` : draft ? <>Perubahan perhitungan ini belum tersimpan. Pilih <strong>Simpan perubahan</strong> di atas sebelum menerbitkan.</> : <>Perhitungan ini hanya pratinjau dan belum disimpan. Pilih <strong>Simpan draf</strong> di atas agar dapat dibuka kembali.</>}</p>
              </div>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th>Modal / unit</th>
                      <th>Ongkir / unit</th>
                      <th>Rekomendasi / unit</th>
                      <th>Harga terpilih / unit</th>
                      <th>Profit baris</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.lines.map((l) => (
                      <tr key={l.line_id}>
                        <td>
                          {l.name}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {l.quantity} {l.unit}
                          </p>
                        </td>
                        <td className="whitespace-nowrap">
                          {rupiah(l.purchase_price)}
                        </td>
                        <td className="whitespace-nowrap">
                          {rupiah(l.shipping_per_unit)}
                        </td>
                        <td className="whitespace-nowrap">
                          {rupiah(l.recommended_price)}
                        </td>
                        <td className="whitespace-nowrap font-semibold">
                          {rupiah(l.selected_price)}
                        </td>
                        <td
                          className={`whitespace-nowrap ${new Decimal(l.profit).lt(0) ? "text-destructive" : "text-primary"}`}
                        >
                          {rupiah(l.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-6 pb-4 text-xs text-muted-foreground">Penyesuaian pembulatan pada baris terakhir memastikan jumlah profit per baris sama dengan estimasi profit transaksi.</p>
              <div className="grid gap-3 bg-muted/40 p-6 sm:grid-cols-4">
                {[
                  { label: "Total modal", value: c.purchase },
                  { label: "Biaya operasional", value: c.operational },
                  { label: "Biaya pemasaran", value: c.marketing },
                  { label: "Estimasi profit", value: c.profit },
                ].map((r) => (
                  <div key={r.label}>
                    <p className="text-xs text-muted-foreground">{r.label}</p>
                    <p className="mt-2 text-sm font-semibold">
                      {rupiah(r.value)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 border-t border-border p-6 sm:grid-cols-4">
                {[
                  { label: "Basis biaya (C)", value: c.cost_base ?? c.purchase },
                  { label: "Target profit", value: c.target_profit ?? "0" },
                  { label: "Selisih target", value: c.target_gap ?? "0" },
                  { label: "Pajak terkumpul", value: c.tax },
                  { label: "Pendapatan produk sebelum pajak", value: c.product_revenue ?? c.subtotal },
                  { label: "Total biaya termasuk pemasaran", value: c.total_cost ?? c.purchase },
                ].map((r) => <div key={r.label}><p className="text-xs text-muted-foreground">{r.label}</p><p className="mt-2 text-sm font-semibold">{rupiah(r.value)}</p></div>)}
              </div>
              {c.profit_percent !== undefined && <p className="px-6 text-xs text-muted-foreground">Profit {c.profit_percent}% terhadap basis biaya C (bukan margin atas pendapatan).</p>}
              {c.profit_status && <p className={`px-6 pb-4 text-sm font-semibold ${c.profit_status === "loss" ? "text-destructive" : c.profit_status === "below" ? "text-amber-700" : "text-primary"}`}>{({ target: "Mencapai target", below: "Di bawah target", even: "Impas", loss: "Rugi" } as const)[c.profit_status]}</p>}
              {c.operational_items?.map((op) => <div key={op.name} className="flex justify-between px-6 py-2 text-sm"><span>{op.name} ({op.percent}%)</span><span>{rupiah(op.amount)}</span></div>)}
              {c.provisional && <p className="px-6 pb-4 text-sm font-medium text-amber-700">Belum termasuk ongkir. Perhitungan sementara.</p>}
              {new Decimal(c.profit).lt(0) && (
                <p
                  role="alert"
                  className="bg-red-50 p-4 text-sm text-destructive"
                >
                  Transaksi ini rugi {rupiah(new Decimal(c.profit).abs())}.
                  Konfirmasi khusus diperlukan saat menyimpan dan menerbitkan.
                </p>
              )}
            </Card>
            <CustomerPreview calculation={c} />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="mr-auto flex items-center gap-1 text-xs text-muted-foreground">
                <Check size={14} />
                Perhitungan server telah ditinjau
              </span>
              {draft && (
                <Button
                  disabled={busy || draft.calculation_hash !== preview.hash}
                  onClick={() => issue()}
                >
                  Terbitkan invoice
                  <ArrowRight size={16} />
                </Button>
              )}
            </div>
          </div>
        )}
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(o) => {
            if (!o) setConfirm(null);
          }}
          title={
            confirm === "save"
              ? "Konfirmasi transaksi rugi"
              : "Terbitkan invoice?"
          }
          description={
            confirm === "save"
              ? `Saya memahami estimasi kerugian ${c ? rupiah(new Decimal(c.profit).abs()) : ""} pada perhitungan ini.`
              : `Detail invoice akan dibekukan. ${c && new Decimal(c.profit).lt(0) ? `Saya juga mengonfirmasi kerugian ${rupiah(new Decimal(c.profit).abs())} pada versi draf ini.` : ""}`
          }
          danger={!!c && new Decimal(c.profit).lt(0)}
          onConfirm={() => {
            const action = confirm;
            setConfirm(null);
            if (action === "save") void save(true);
            else void issue(true);
          }}
        />
      </div>
    </DataState>
  );
}
export function CustomerPreview({
  calculation: c,
}: {
  calculation: Preview["calculation"];
}) {
  return (
    <Card className="p-6 md:p-8">
      <p className="mb-6 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Pratinjau untuk pelanggan
      </p>
      <div className="flex flex-wrap justify-between gap-5">
        <div>
          <h2 className="text-xl font-semibold">{c.company.company_name}</h2>
          <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">
            {c.company.address}
            <br />
            {c.company.contact}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ditagihkan kepada</p>
          <p className="mt-2 font-semibold">{c.customer.name}</p>
          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted-foreground">
            {c.customer.address}
          </p>
          <p className="text-xs text-muted-foreground">{[c.customer.email, c.customer.phone].filter(Boolean).join(" · ")}</p>
          {c.shipping_address && <p className="mt-2 text-xs">Kirim ke: {c.shipping_address}</p>}
          {c.shipping_carrier && <p className="text-xs">Kurir: {c.shipping_carrier}</p>}
          <p className="mt-2 text-xs">Tanggal invoice: {c.invoice_date ?? "—"}</p>
          <p className="mt-2 text-xs">Jatuh tempo: {c.due_date}</p>
        </div>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Deskripsi</th>
              <th>Jumlah</th>
              <th>Harga satuan</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((l) => (
              <tr key={l.line_id}>
                <td>{l.name}</td>
                <td>
                  {l.quantity} {l.unit}
                </td>
                <td className="whitespace-nowrap">
                  {rupiah(l.selected_price)}
                </td>
                <td className="whitespace-nowrap">{rupiah(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto mt-6 max-w-sm space-y-3 text-sm">
        {[
          { label: c.tax_mode === "included" ? "Subtotal (termasuk pajak)" : "Subtotal", value: c.subtotal },
          { label: "Ongkir", value: c.shipping },
          ...(c.tax_enabled === false ? [] : [{ label: `${c.tax_name ?? "Pajak"} (${c.tax_mode === "included" ? "termasuk" : "tambahan"}, ${c.tax_percent}%)`, value: c.tax }]),
        ].map((r) => (
          <div key={r.label} className="flex justify-between">
            <span className="text-muted-foreground">{r.label}</span>
            <span>{rupiah(r.value)}</span>
          </div>
        ))}
        {c.tax_enabled !== false && c.tax_product && <div className="flex justify-between"><span className="text-muted-foreground">Pajak produk</span><span>{rupiah(c.tax_product)}</span></div>}
        {c.tax_enabled !== false && c.tax_shipping && <div className="flex justify-between"><span className="text-muted-foreground">Pajak ongkir</span><span>{rupiah(c.tax_shipping)}</span></div>}
        <div className="flex justify-between border-t border-border pt-4 font-semibold">
          <span>Total tagihan</span>
          <span className="text-lg text-primary">{rupiah(c.total)}</span>
        </div>
      </div>
      {c.notes && (
        <p className="mt-6 whitespace-pre-line text-xs text-muted-foreground">
          {c.notes}
        </p>
      )}
    </Card>
  );
}
