"use client";
import Link from "next/link";
import { ArrowUpRight, Banknote, Wallet, Receipt, Clock3, Plus, FileText } from "lucide-react";
import Decimal from "decimal.js";
import type { Dashboard, Profile } from "@/lib/types";
import { rupiah, dateID, invoiceStatus } from "@/lib/utils";
import { Card } from "./ui/card";
import { Badge, DataState, useData } from "./data";
export function DashboardView({ profile }: { profile: Profile }) {
  const { data, loading, error } = useData<
    Dashboard & { months: { month: string; total: string }[] }
  >("dashboard");
  const collectionRate = data && !new Decimal(data.sales).isZero()
    ? Decimal.min(100, new Decimal(data.payments).div(data.sales).mul(100))
    : new Decimal(0);
  return (
    <DataState loading={loading} error={error}>
      {data && (
        <>
          <Card className="relative isolate overflow-hidden border-0 p-6 text-white shadow-lg shadow-[#153c46]/10 sm:p-9" style={{ backgroundImage: "linear-gradient(115deg, #123f4a 0%, #087d92 58%, #1196a0 100%)" }}>
            <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-32 -z-10 h-80 w-80 rounded-full border-[36px] border-white/[0.07] sm:right-14 sm:top-[-190px] sm:h-[450px] sm:w-[450px]" />
            <div aria-hidden="true" className="pointer-events-none absolute bottom-[-130px] right-[28%] -z-10 h-64 w-64 rounded-full bg-[#b4d93b]/10 blur-3xl" />
            <div className="grid gap-8 lg:grid-cols-[1.35fr_.65fr] lg:items-end">
              <div>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-[#d7edb1]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#c4e44e]" />
                  Ringkasan finansial
                </div>
                <h2 className="text-sm font-medium text-white/75">Total penjualan aktif</h2>
                <p className="mt-2 break-words text-3xl font-semibold tracking-[-.045em] tabular-nums sm:text-4xl lg:text-[2.7rem]">{rupiah(data.sales)}</p>
                <p className="mt-3 text-xs text-white/65">{data.invoice_count} invoice berjalan <span className="mx-1.5 text-white/30">/</span> nilai termasuk pajak</p>
                <div className="mt-7 flex flex-wrap gap-2">
                  {profile.role !== "finance" && <Link href="/pricing" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#c4e44e] px-4 text-xs font-bold text-[#183b3e] shadow-sm transition hover:bg-[#d1ed69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Plus size={15} />Buat transaksi</Link>}
                  <Link href="/invoices" className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 text-xs font-semibold text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><FileText size={15} />Lihat invoice<ArrowUpRight size={14} /></Link>
                </div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-[#0c3844]/30 p-5 backdrop-blur-sm sm:p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/65">Tingkat penerimaan</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-.05em] tabular-nums text-[#d2eb79]">{collectionRate.toDecimalPlaces(1).toFixed(1)}<span className="ml-0.5 text-xl">%</span></p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Persentase nilai invoice aktif yang telah dibayar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={collectionRate.toDecimalPlaces(0).toNumber()}>
                  <div className="h-full rounded-full bg-[#c4e44e] transition-all duration-500" style={{ width: `${collectionRate.toString()}%` }} />
                </div>
                <p className="mt-3 text-[10px] leading-5 text-white/60">Porsi total invoice aktif yang sudah dibayar pelanggan.</p>
              </div>
            </div>
          </Card>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Pembayaran diterima",
                value: rupiah(data.payments),
                sub: "Pembayaran yang masih aktif",
                icon: Wallet,
                color: "bg-[#e4f4f1] text-[#087d74]",
              },
              {
                label: "Sisa tagihan",
                value: rupiah(data.outstanding),
                sub: "Menunggu pembayaran pelanggan",
                icon: Clock3,
                color: "bg-[#fff4da] text-[#ad7619]",
              },
              {
                label: "Invoice aktif",
                value: String(data.invoice_count),
                sub: "Invoice yang tidak dibatalkan",
                icon: Receipt,
                color: "bg-[#edf0fb] text-[#5365ae]",
              },
            ].map((c) => (
              <Card key={c.label} className="group min-w-0 border-transparent p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-md">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {c.label}
                  </p>
                  <div className={`rounded-xl p-2.5 transition-transform group-hover:scale-105 ${c.color}`}>
                    <c.icon size={17} />
                  </div>
                </div>
                <p className="break-words text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
                  {c.value}
                </p>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {c.sub}
                </p>
              </Card>
            ))}
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between p-6">
                <div>
                  <h2 className="text-sm font-semibold">Penjualan bulanan</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enam bulan terakhir • invoice aktif
                  </p>
                </div>
                <span className="rounded-md border border-border px-2 py-1 text-[10px]">
                  IDR
                </span>
              </div>
              {data.months.length ? (
                <div role="img" aria-label="Grafik penjualan bulanan selama enam bulan terakhir" className="grid h-60 grid-cols-6 items-end gap-2 px-4 pb-5 pt-8 sm:gap-4 sm:px-6">
                  {data.months.map((m) => {
                    const max = Decimal.max(...data.months.map((x) => x.total));
                    const pct = max.isZero() ? 0 : new Decimal(m.total).div(max).mul(100).toNumber();
                    return (
                      <div key={m.month} title={`${new Date(`${m.month}-01T00:00:00+07:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}: ${rupiah(m.total)}`} className="flex h-full min-w-0 flex-col items-center justify-end gap-3">
                        <div className="flex w-full flex-1 items-end justify-center rounded-t-xl bg-[#f2f6f5] px-1 pt-2">
                          <div
                            style={{ height: `${Math.max(pct, 3)}%` }}
                            className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-[#087d92] to-[#49b8a1] shadow-[0_3px_10px_rgba(8,125,146,.18)] transition-all duration-500"
                          />
                        </div>
                        <span className="text-[10px] font-semibold capitalize text-muted-foreground sm:text-xs">{new Date(`${m.month}-01T00:00:00+07:00`).toLocaleDateString("id-ID", { month: "short", timeZone: "Asia/Jakarta" })}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-52 flex-col items-center justify-center text-sm text-muted-foreground">
                  <Banknote className="mb-3" size={28} />
                  <p>Grafik akan tampil setelah invoice diterbitkan.</p>
                </div>
              )}
            </Card>
            <Card className="p-6">
              <h2 className="text-sm font-semibold">Arus pembayaran</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Perbandingan tagihan aktif Anda
              </p>
              <div
                className="my-8 flex h-5 overflow-hidden rounded-full bg-amber-100"
                role="progressbar"
                aria-label="Persentase tagihan yang sudah diterima"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={new Decimal(data.sales).isZero() ? 0 : Decimal.min(100, new Decimal(data.payments).div(data.sales).mul(100)).toDecimalPlaces(0).toNumber()}
              >
                <div
                  className="h-full bg-primary"
                  style={{
                    width: new Decimal(data.sales).isZero()
                      ? "0%"
                      : `${new Decimal(data.payments).div(data.sales).mul(100).toString()}%`,
                  }}
                />
              </div>
              <div className="space-y-5">
                {[
                  {
                    label: "Sudah diterima",
                    value: data.payments,
                    color: "bg-primary",
                  },
                  {
                    label: "Belum diterima",
                    value: data.outstanding,
                    color: "bg-amber-300",
                  },
                ].map((p) => (
                  <div key={p.label} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${p.color}`} />
                    <span className="text-xs text-muted-foreground">
                      {p.label}
                    </span>
                    <span className="ml-auto text-sm font-semibold">
                      {rupiah(p.value)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-8 rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
                Ringkasan mencakup seluruh data yang diizinkan untuk peran Anda.
              </p>
            </Card>
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between p-6">
                <h2 className="text-sm font-semibold">Invoice terbaru</h2>
                <Link
                  className="flex items-center gap-1 text-xs text-primary"
                  href="/invoices"
                >
                  Lihat semua
                  <ArrowUpRight size={14} />
                </Link>
              </div>
              <DataState
                loading={false}
                error=""
                empty={!data.recent_invoices.length}
              >
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice / pelanggan</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_invoices.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <Link
                              className="font-semibold text-primary"
                              href={`/invoices?id=${i.id}`}
                            >
                              {i.number}
                            </Link>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {i.snapshot.customer.name}
                            </p>
                          </td>
                          <td className="whitespace-nowrap font-medium">
                            {rupiah(i.total)}
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DataState>
            </Card>
            <Card>
              <div className="p-6">
                <h2 className="text-sm font-semibold">Transaksi terakhir</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Riwayat pembayaran terbaru
                </p>
              </div>
              <DataState
                loading={false}
                error=""
                empty={!data.recent_payments.length}
              >
                <div className="space-y-5 px-6 pb-6">
                  {data.recent_payments.map((p) => (
                    <div key={p.id} className="flex items-start gap-3">
                      <div className="rounded-lg bg-emerald-50 p-2 text-primary">
                        <Wallet size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{p.method}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {dateID(p.paid_on)}
                        </p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-xs font-semibold">
                          {rupiah(p.amount)}
                        </p>
                        {p.cancelled_at && <Badge tone="red">Dibatalkan</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </DataState>
            </Card>
          </div>
        </>
      )}
    </DataState>
  );
}
