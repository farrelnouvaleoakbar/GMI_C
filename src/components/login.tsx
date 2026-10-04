"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function LoginForm({ ready }: { ready: boolean }) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_.92fr]">
      <div className="relative hidden overflow-hidden bg-[#103744] p-14 text-white lg:flex lg:flex-col xl:p-[4.5rem]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-[17%] h-[540px] w-[540px] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 top-[23%] h-[410px] w-[410px] rounded-full border-[52px] border-white/[0.035]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-[30%] h-72 w-72 rounded-full bg-[#a9d43b]/10 blur-3xl" />
        <div className="relative z-10 flex w-fit items-center rounded-xl bg-white px-3 py-1.5">
          <Image src="/brand/gmi-logo.png" alt="Global Medika Indonesia" width={220} height={113} priority className="h-auto w-48" />
        </div>
        <div className="relative z-10 my-auto max-w-xl py-14">
          <p className="mb-6 flex items-center gap-2 text-[10px] font-semibold tracking-[.22em] text-[#c5e65a]">
            <span className="h-px w-7 bg-[#c5e65a]" />
            SISTEM OPERASIONAL INTERNAL
          </p>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-.055em] xl:text-6xl">
            Setiap transaksi,
            <br />
            lebih terarah.
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 text-[#c1d7d8]">
            Dari harga modal hingga pelunasan, semua catatan bisnis tim GMI tersusun dalam satu alur kerja.
          </p>
          <div className="mt-12 grid max-w-md grid-cols-3 gap-3">
            {[["01", "Kalkulasi"], ["02", "Tagihan"], ["03", "Pembayaran"]].map(([n, title]) => (
              <div key={n} className="border-t border-white/20 pt-3">
                <span className="text-[10px] font-semibold text-[#c5e65a]">{n}</span>
                <p className="mt-1 text-xs font-medium text-white/85">{title}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-5 text-[10px] font-medium uppercase tracking-[.15em] text-[#9ebcbe]">
          <span>Global Medika Indonesia</span>
          <span>Staff portal</span>
        </div>
      </div>
      <div className="flex min-h-screen items-center justify-center bg-[#f3f6f5] p-5 sm:p-8 lg:p-12">
        <div className="w-full max-w-[420px] rounded-[26px] border border-[#e2e9e6] bg-white p-6 shadow-[0_22px_65px_-38px_rgba(19,57,67,.28)] sm:p-9">
          <div className="mb-9 lg:hidden">
            <div className="w-fit rounded-lg bg-white">
              <Image src="/brand/gmi-logo.png" alt="Global Medika Indonesia" width={180} height={93} priority className="h-auto w-40" />
            </div>
          </div>
          <div className="mb-7 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e5f4f2] text-primary">
            <ShieldCheck size={21} />
          </div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-primary">
            Akses staf terverifikasi
          </p>
          <h2 className="text-3xl font-semibold tracking-[-.045em] text-[#153c46]">
            Masuk ke ruang kerja
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Gunakan akun staf yang telah diaktifkan oleh Admin.
          </p>
          {!ready && (
            <div
              role="status"
              className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
            >
              Setup diperlukan. Salin <code>.env.example</code> ke{" "}
              <code>.env.local</code>, isi konfigurasi Supabase, lalu jalankan
              migrasi dan buat Admin sesuai README.
            </div>
          )}
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email">Alamat email</label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="nama@perusahaan.co.id"
                required
              />
            </div>
            <div>
              <label htmlFor="password">Kata sandi</label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={!ready || busy}>
              {busy ? "Memverifikasi…" : "Masuk"}
              <ArrowRight size={16} />
            </Button>
          </form>
          <p className="mt-8 flex items-center gap-2 border-t border-border pt-5 text-xs text-muted-foreground">
            <ShieldCheck size={15} className="text-primary" />
            Akses hanya untuk staf yang terdaftar.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Lupa kata sandi? Hubungi Admin untuk reset melalui Supabase Auth.
          </p>
        </div>
      </div>
    </main>
  );
}
