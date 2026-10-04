"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import {
  Plus,
  FileText,
  Download,
  Copy,
  GitBranch,
  Trash2,
  ArrowLeft,
  Wallet,
} from "lucide-react";
import Decimal from "decimal.js";
import type { Draft, Invoice, Profile, Payment } from "@/lib/types";
import { rupiah, dateID, invoiceStatus } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { ConfirmDialog } from "./ui/alert-dialog";
import {
  api,
  useList,
  useData,
  DataState,
  ListToolbar,
  Badge,
  Field,
  type Notify,
} from "./data";
import { CustomerPreview } from "./pricing";
export function DraftsView({ notify }: { notify: Notify }) {
  const list = useList<Draft>("drafts"),
    [remove, setRemove] = useState<Draft | null>(null);
  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button asChild>
          <Link href="/pricing">
            <Plus size={16} />
            Draf baru
          </Link>
        </Button>
      </div>
      <Card className="overflow-hidden">
        <ListToolbar
          count={list.data?.count || 0}
          page={list.page}
          setPage={list.setPage}
          onSearch={list.setSearch}
        />
        <DataState
          loading={list.loading}
          error={list.error}
          empty={!list.data?.data.length}
        >
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Pelanggan</th>
                  <th>Diperbarui</th>
                  <th>Total</th>
                  <th>Jenis</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.data.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <p className="font-semibold">
                        {d.calculation.customer.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Versi {d.version}
                      </p>
                    </td>
                    <td>{dateID(d.updated_at)}</td>
                    <td className="whitespace-nowrap">
                      {rupiah(d.calculation.total)}
                    </td>
                    <td>
                      <Badge>{d.revision_of ? "Revisi" : "Draf"}</Badge>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Button asChild variant="outline" size="sm">
                          <a href={`/api/draft/${d.id}/pdf`} download>
                            <Download size={14} />
                            PDF draf
                          </a>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/pricing?draft=${d.id}`}>
                            Buka & tinjau
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Hapus draf"
                          onClick={() => setRemove(d)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </Card>
      <ConfirmDialog
        open={!!remove}
        onOpenChange={(o) => {
          if (!o) setRemove(null);
        }}
        title="Hapus draf?"
        description="Draf yang belum diterbitkan akan dihapus. Invoice yang telah diterbitkan tetap tersimpan."
        danger
        onConfirm={async () => {
          if (!remove) return;
          try {
            await api("draft/delete", {
              draft_id: remove.id,
              expected_version: remove.version,
            });
            list.refresh();
            notify("Draf dihapus.");
          } catch (e) {
            notify((e as Error).message, true);
          }
          setRemove(null);
        }}
      />
    </>
  );
}
export function InvoicesView({
  profile,
  notify,
  initialId,
}: {
  profile: Profile;
  notify: Notify;
  initialId?: string;
}) {
  const list = useList<Invoice>("invoices"),
    [selected, setSelected] = useState<string | null>(initialId ?? null);
  if (selected)
    return (
      <InvoiceDetail
        id={selected}
        profile={profile}
        notify={notify}
        onBack={() => {
          setSelected(null);
          history.replaceState(null, "", "/invoices");
          list.refresh();
        }}
      />
    );
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {list.data?.count || 0} invoice terbit
        </p>
        {profile.role !== "finance" && (
          <Button asChild>
            <Link href="/pricing">
              <Plus size={16} />
              Buat invoice
            </Link>
          </Button>
        )}
      </div>
      <Card className="overflow-hidden">
        <ListToolbar
          count={list.data?.count || 0}
          page={list.page}
          setPage={list.setPage}
          onSearch={list.setSearch}
        />
        <DataState
          loading={list.loading}
          error={list.error}
          empty={!list.data?.data.length}
        >
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Pelanggan</th>
                  <th>Tanggal</th>
                  <th>Total / sisa</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.data.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <button
                        type="button"
                        className="font-semibold text-primary hover:underline"
                        onClick={() => {
                          setSelected(i.id);
                          history.replaceState(
                            null,
                            "",
                            `/invoices?id=${i.id}`,
                          );
                        }}
                      >
                        {i.number}
                      </button>
                      {i.revision_of && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Revisi terhubung
                        </p>
                      )}
                    </td>
                    <td>{i.snapshot.customer.name}</td>
                    <td className="whitespace-nowrap">{dateID(i.issued_at)}</td>
                    <td className="whitespace-nowrap">
                      <p className="font-medium">{rupiah(i.total)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sisa{" "}
                        {i.cancelled_at
                          ? "—"
                          : rupiah(new Decimal(i.total).minus(i.paid))}
                      </p>
                    </td>
                    <td>
                      <Badge
                        tone={
                          i.cancelled_at
                            ? "gray"
                            : invoiceStatus(i) === "Lunas"
                              ? "green"
                              : "amber"
                        }
                      >
                        {invoiceStatus(i)}
                      </Badge>
                    </td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelected(i.id)}
                      >
                        Detail
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </Card>
    </>
  );
}
function InvoiceDetail({
  id,
  profile,
  notify,
  onBack,
}: {
  id: string;
  profile: Profile;
  notify: Notify;
  onBack: () => void;
}) {
  const state = useData<Invoice>(`invoice/${id}`),
    [cancel, setCancel] = useState(false),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false),
    [downloading, setDownloading] = useState(false);
  const i = state.data;
  async function download() {
    setDownloading(true);
    try {
      const r = await fetch(`/api/invoice/${id}/pdf`);
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error);
      }
      const blob = await r.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `${i?.number.replaceAll("/", "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      notify("PDF invoice berhasil diunduh.");
    } catch (e) {
      notify(
        `PDF belum tersedia: ${(e as Error).message} Coba unduh kembali; nomor invoice tetap sama.`,
        true,
      );
    } finally {
      setDownloading(false);
    }
  }
  return (
    <>
      <Button variant="ghost" onClick={onBack} className="mb-4 -ml-3">
        <ArrowLeft size={16} />
        Semua invoice
      </Button>
      <DataState loading={state.loading} error={state.error}>
        {i && (
          <div className="space-y-6">
            <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <FileText size={20} />
                  {i.number}
                </h2>
                <div className="mt-3 flex items-center gap-3">
                  <Badge
                    tone={
                      i.cancelled_at
                        ? "red"
                        : invoiceStatus(i) === "Lunas"
                          ? "green"
                          : "amber"
                    }
                  >
                    {invoiceStatus(i)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Terbit {dateID(i.issued_at)}
                  </span>
                </div>
                {i.revision_of && (
                  <Link
                    href={`/invoices?id=${i.revision_of}`}
                    className="mt-3 block text-xs text-primary"
                  >
                    Lihat invoice asal
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={download} disabled={downloading}>
                  <Download size={16} />
                  {downloading ? "Membuat PDF…" : "Unduh PDF"}
                </Button>
                {profile.role !== "finance" && (
                  <>
                    <Button variant="outline" asChild>
                      <Link href={`/pricing?duplicate=${i.id}`}>
                        <Copy size={15} />
                        Duplikasi
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={`/pricing?duplicate=${i.id}&revision=1`}>
                        <GitBranch size={15} />
                        Buat revisi
                      </Link>
                    </Button>
                    {!i.cancelled_at && (
                      <Button
                        variant="outline"
                        onClick={() => setCancel(!cancel)}
                      >
                        Batalkan
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
            {i.cancelled_at && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-destructive">
                Invoice dibatalkan: {i.cancellation_reason}
              </div>
            )}
            {cancel && (
              <Card className="p-6">
                <Field
                  label="Alasan pembatalan (minimal 5 karakter)"
                  id="cancel-reason"
                >
                  <textarea
                    id="cancel-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={1000}
                  />
                </Field>
                <p className="my-3 text-xs text-muted-foreground">
                  Pembayaran aktif harus dibatalkan terlebih dahulu oleh Admin
                  atau Finance.
                </p>
                <Button
                  variant="destructive"
                  disabled={reason.trim().length < 5}
                  onClick={() => setConfirm(true)}
                >
                  Konfirmasi pembatalan
                </Button>
              </Card>
            )}
            <CustomerPreview calculation={i.snapshot} />
            <Card className="grid gap-4 p-6 sm:grid-cols-3">
              {[
                { label: "Total tagihan", value: i.total },
                { label: "Sudah dibayar", value: i.paid },
                {
                  label: "Sisa tagihan",
                  value: new Decimal(i.total).minus(i.paid).toString(),
                },
              ].map((c) => (
                <div key={c.label}>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="mt-2 text-xl font-semibold">
                    {i.cancelled_at && c.label === "Sisa tagihan"
                      ? "—"
                      : rupiah(c.value)}
                  </p>
                </div>
              ))}
            </Card>
            {["admin", "finance"].includes(profile.role) &&
              !i.cancelled_at &&
              new Decimal(i.paid).lt(i.total) && (
                <PaymentForm
                  invoice={i}
                  notify={notify}
                  onSaved={state.refresh}
                />
              )}
            <PaymentHistory
              invoiceId={id}
              editable={profile.role !== "sales"}
              notify={notify}
              onChanged={state.refresh}
            />
            <ConfirmDialog
              open={confirm}
              onOpenChange={setConfirm}
              title="Batalkan invoice ini?"
              description="Nomor dan detail invoice akan dipertahankan beserta alasan pembatalannya. Invoice dikeluarkan dari total penjualan aktif."
              danger
              onConfirm={async () => {
                try {
                  await api("invoice/cancel", {
                    invoice_id: id,
                    expected_version: i.version,
                    reason,
                  });
                  setCancel(false);
                  state.refresh();
                  notify("Invoice berhasil dibatalkan.");
                } catch (e) {
                  notify((e as Error).message, true);
                }
              }}
            />
          </div>
        )}
      </DataState>
    </>
  );
}
function PaymentForm({
  invoice,
  notify,
  onSaved,
}: {
  invoice: Invoice;
  notify: Notify;
  onSaved: () => void;
}) {
  const pendingRef = useRef<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false),
    [retry, setRetry] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    const stored = sessionStorage.getItem(`payment-${invoice.id}`);
    if (stored) {
      try {
        // Restore a persistent idempotency submission after reload.
        pendingRef.current = JSON.parse(stored);
        setRetry(pendingRef.current);
      } catch {
        sessionStorage.removeItem(`payment-${invoice.id}`);
      }
    }
  }, [invoice.id]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const payload = pendingRef.current ||
      retry || {
        invoice_id: invoice.id,
        request_id: crypto.randomUUID(),
        amount: String(f.get("amount")),
        paid_on: f.get("paid_on"),
        method: f.get("method"),
        reference: f.get("reference"),
      };
    pendingRef.current = payload;
    sessionStorage.setItem(`payment-${invoice.id}`, JSON.stringify(payload));
    setRetry(payload);
    setBusy(true);
    try {
      await api("payment", payload);
      sessionStorage.removeItem(`payment-${invoice.id}`);
      pendingRef.current = null;
      setRetry(null);
      form.reset();
      onSaved();
      notify("Pembayaran berhasil dicatat.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-6">
      <h2 className="mb-5 flex items-center gap-2 font-semibold">
        <Wallet size={18} />
        Catat pembayaran
      </h2>
      {retry && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Pengajuan tersimpan: {rupiah(String(retry.amount))},{" "}
          {String(retry.paid_on)}, {String(retry.method)}, referensi{" "}
          {String(retry.reference) || "—"}. Coba ulang dengan data dan kunci
          yang sama agar tidak tercatat dua kali. Jika server menolak data, Anda
          dapat membuang pengajuan setelah memeriksa riwayat pembayaran.
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset
          disabled={!!retry || busy}
          className="grid gap-4 md:grid-cols-2"
        >
          <Field label="Nominal pembayaran (Rp)" id="amount">
            <Input
              id="amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              max={new Decimal(invoice.total).minus(invoice.paid).toString()}
              required={!retry}
            />
          </Field>
          <Field label="Tanggal pembayaran" id="paid_on">
            <Input
              id="paid_on"
              name="paid_on"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              max={new Date().toISOString().slice(0, 10)}
              required={!retry}
            />
          </Field>
          <Field label="Metode pembayaran" id="method">
            <select id="method" name="method">
              <option>Transfer bank</option>
              <option>Tunai</option>
              <option>QRIS manual</option>
              <option>Lainnya</option>
            </select>
          </Field>
          <Field label="Referensi (opsional)" id="reference">
            <Input id="reference" name="reference" maxLength={200} />
          </Field>
        </fieldset>
        <div className="mt-5 flex gap-2">
          <Button disabled={busy}>
            {busy
              ? "Mencatat…"
              : retry
                ? "Coba ulang pengajuan"
                : "Simpan pembayaran"}
          </Button>
          {retry && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                sessionStorage.removeItem(`payment-${invoice.id}`);
                pendingRef.current = null;
                setRetry(null);
              }}
            >
              Buang pengajuan
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
function PaymentHistory({
  invoiceId,
  editable,
  notify,
  onChanged,
}: {
  invoiceId?: string;
  editable: boolean;
  notify: Notify;
  onChanged: () => void;
}) {
  const list = useList<Payment>(
      "payments",
      invoiceId ? `&invoice_id=${invoiceId}` : "",
    ),
    [cancel, setCancel] = useState<Payment | null>(null),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false);
  return (
    <Card className="overflow-hidden">
      <h2 className="p-6 text-sm font-semibold">Riwayat pembayaran</h2>
      <ListToolbar
        count={list.data?.count || 0}
        page={list.page}
        setPage={list.setPage}
        onSearch={list.setSearch}
      />
      {cancel && (
        <div className="border-b border-border p-5">
          <Field label="Alasan pembatalan pembayaran" id="payment-cancel">
            <Input
              id="payment-cancel"
              value={reason}
              minLength={5}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              disabled={reason.trim().length < 5}
              onClick={() => setConfirm(true)}
            >
              Batalkan pembayaran {rupiah(cancel.amount)}
            </Button>
            <Button variant="outline" onClick={() => setCancel(null)}>
              Kembali
            </Button>
          </div>
        </div>
      )}
      <DataState
        loading={list.loading}
        error={list.error}
        empty={!list.data?.data.length}
      >
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Metode / referensi</th>
                <th>Nominal</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.data.map((p) => (
                <tr key={p.id}>
                  <td>{dateID(p.paid_on)}</td>
                  <td>
                    {p.method}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.reference || "Tanpa referensi"}
                    </p>
                  </td>
                  <td className="whitespace-nowrap">{rupiah(p.amount)}</td>
                  <td>
                    <Badge tone={p.cancelled_at ? "red" : "green"}>
                      {p.cancelled_at ? "Dibatalkan" : "Tercatat"}
                    </Badge>
                    {p.cancellation_reason && (
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                        {p.cancellation_reason}
                      </p>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      {!invoiceId && (
                        <Link
                          className="text-xs text-primary"
                          href={`/invoices?id=${p.invoice_id}`}
                        >
                          Invoice
                        </Link>
                      )}
                      {editable && !p.cancelled_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCancel(p);
                            setReason("");
                          }}
                        >
                          Batalkan
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Batalkan pembayaran?"
        description="Catatan pembayaran tetap tersimpan. Sisa tagihan akan bertambah kembali dan pembatalan dicatat dalam log aktivitas."
        danger
        onConfirm={async () => {
          if (!cancel) return;
          try {
            await api("payment/cancel", {
              payment_id: cancel.id,
              expected_version: cancel.version,
              reason,
            });
            setCancel(null);
            list.refresh();
            onChanged();
            notify("Pembayaran dibatalkan.");
          } catch (e) {
            notify((e as Error).message, true);
          }
        }}
      />
    </Card>
  );
}
export function PaymentsView({ notify }: { notify: Notify }) {
  return (
    <>
      <p className="mb-5 text-sm text-muted-foreground">
        Buka invoice untuk mencatat pembayaran sebagian atau penuh.
      </p>
      <PaymentHistory editable notify={notify} onChanged={() => {}} />
    </>
  );
}
