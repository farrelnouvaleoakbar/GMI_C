"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  Users,
  Calculator,
  FilePenLine,
  FileText,
  Wallet,
  Settings,
  UserRoundCog,
  History,
  LogOut,
  Menu,
  ChevronRight,
  UserRound,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { Profile } from "@/lib/types";
import { Button } from "./ui/button";
import { api } from "./data";
import { DashboardView } from "./dashboard";
import { MasterView } from "./masters";
import { PricingView } from "./pricing";
import { DraftsView, InvoicesView, PaymentsView } from "./transactions";
import { SettingsView, StaffView, AuditView, AccountView } from "./settings";
const nav = [
  { id: "dashboard", label: "Ringkasan", group: "Umum", icon: LayoutDashboard },
  { id: "products", label: "Produk", group: "Data bisnis", icon: Package },
  { id: "customers", label: "Pelanggan", group: "Data bisnis", icon: Users },
  { id: "pricing", label: "Kalkulator harga", group: "Transaksi", icon: Calculator },
  { id: "drafts", label: "Draf transaksi", group: "Transaksi", icon: FilePenLine },
  { id: "invoices", label: "Invoice", group: "Transaksi", icon: FileText },
  { id: "payments", label: "Pembayaran", group: "Transaksi", icon: Wallet },
  { id: "settings", label: "Pengaturan", group: "Administrasi", icon: Settings },
  { id: "staff", label: "Manajemen staf", group: "Administrasi", icon: UserRoundCog },
  { id: "audit", label: "Log aktivitas", group: "Administrasi", icon: History },
];
const descriptions: Record<string, string> = {
  dashboard: "Pantau bisnis Anda, dari penjualan hingga pembayaran.",
  products: "Katalog produk dan modal sebagai dasar harga yang akurat.",
  customers: "Bangun hubungan baik dengan setiap pelanggan.",
  pricing: "Dari modal menjadi harga jual yang terukur.",
  drafts: "Siapkan dan tinjau transaksi sebelum diterbitkan.",
  invoices: "Semua tagihan, status, dan riwayat dalam satu tempat.",
  payments: "Catat pembayaran dan kendalikan sisa tagihan.",
  settings: "Identitas perusahaan dan preferensi bisnis Anda.",
  staff: "Atur peran dan akses anggota tim.",
  audit: "Jejak perubahan untuk bisnis yang transparan.",
  account: "Kelola keamanan akun Anda.",
};
export function Workspace({
  profile,
  section,
  initialInvoiceId,
}: {
  profile: Profile;
  section: string;
  initialInvoiceId?: string;
}) {
  const router = useRouter();
  const [mobile, setMobile] = useState(false),
    [notice, setNotice] = useState<{ message: string; error: boolean } | null>(
      null,
    );
  const notify = (message: string, error = false) => {
    setNotice({ message, error });
  };
  const allowed = nav.filter(
    (n) =>
      profile.role === "admin" ||
      (!["settings", "staff", "audit"].includes(n.id) &&
        (profile.role !== "finance" || !["pricing", "drafts"].includes(n.id)) &&
        (profile.role !== "sales" || n.id !== "payments")),
  );
  const title = nav.find((n) => n.id === section)?.label || "Akun saya";
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 bg-card p-3 focus:not-sr-only focus:fixed"
      >
        Langsung ke konten
      </a>
      {mobile && (
        <button
          type="button"
          aria-label="Tutup menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[#e2eae7] bg-[#fbfcfb] text-[#24434a] transition-transform ${mobile ? "translate-x-0 shadow-xl" : "-translate-x-full"} lg:translate-x-0 lg:shadow-none`}
      >
        <Link
          href="/dashboard"
          className="mx-4 mt-5 flex h-[68px] items-center justify-center rounded-xl border border-[#e7eeeb] bg-white px-4"
        >
          <Image src="/brand/gmi-logo.png" alt="Global Medika Indonesia" width={180} height={93} priority className="h-auto w-40" />
        </Link>
        <div className="px-7 pb-2 pt-5">
          <p className="text-[10px] font-semibold uppercase tracking-[.19em] text-[#8a9e9e]">
            GMI • BUSINESS DESK
          </p>
          <p className="mt-1 text-xs text-[#809295]">Ruang kerja tim Anda</p>
        </div>
        <p className="sr-only">
          Ruang kerja
        </p>
        <nav aria-label="Navigasi utama" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {allowed.map((n, i) => (
            <div key={n.id}>
              {(i === 0 || allowed[i - 1]?.group !== n.group) && (
                  <p className={`${i === 0 ? "pb-2 pt-1" : "pb-2 pt-5"} px-4 text-[10px] font-semibold uppercase tracking-[.16em] text-[#91a1a0]`}>
                  {n.group}
                </p>
              )}
              <Link
                href={`/${n.id}`}
                onClick={() => setMobile(false)}
                aria-current={section === n.id ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-xl border-l-2 px-4 py-3 text-[13px] transition-colors ${section === n.id ? "border-l-[#a9d43b] bg-[#e9f4f1] font-semibold text-[#176c70]" : "border-l-transparent text-[#63777b] hover:bg-[#f0f5f3] hover:text-[#24434a]"}`}
              >
                <n.icon size={17} className={section === n.id ? "text-[#087d92]" : "text-[#8a9b9d] group-hover:text-[#087d92]"} />
                {n.label}
                {section === n.id && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#a9d43b]" />
                )}
              </Link>
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-[#e5ece9] p-4">
          <Link
            href="/account"
            className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[#f0f5f3]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e4f2ee] text-sm font-bold text-[#087d92]">
              {profile.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[#24434a]">{profile.name}</p>
              <p className="mt-1 text-[10px] capitalize text-[#809295]">
                {profile.role} • Aktif
              </p>
            </div>
            <ChevronRight size={14} className="ml-auto" />
          </Link>
          <Button
            variant="ghost"
            className="mt-2 w-full justify-start text-[#718487] hover:bg-[#f0f5f3] hover:text-[#24434a]"
            onClick={async () => {
              try {
                await api("logout", {});
                router.replace("/login");
                router.refresh();
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          >
            <LogOut size={15} />
            Keluar
          </Button>
        </div>
      </aside>
      <div className="lg:ml-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/80 bg-white/90 px-5 backdrop-blur-xl md:px-9">
          <div className="flex items-center gap-3">
            <Button
              aria-label="Buka menu"
              aria-controls="workspace-navigation"
              aria-expanded={mobile}
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">Ruang kerja</span>
            <ChevronRight size={13} className="hidden text-muted-foreground sm:block" />
            <span className="text-xs font-semibold text-[#174652]">{title}</span>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">
            {new Date().toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "Asia/Jakarta",
            })}
          </span>
          <Link
            aria-label="Akun saya"
            href="/account"
            className="rounded-full border border-border p-2 sm:hidden"
          >
            <UserRound size={16} />
          </Link>
        </header>
        <main id="main" className="mx-auto max-w-[1500px] px-4 py-6 md:px-9 md:py-9">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-primary">
                {section === "dashboard"
                  ? "GAMBARAN BISNIS"
                  : "MANAJEMEN BISNIS"}
              </p>
              <h1 className="text-3xl font-semibold tracking-[-.04em] text-[#153c46] md:text-[2.1rem]">
                {section === "dashboard"
                  ? `Selamat datang, ${profile.name.split(" ")[0]}`
                  : title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {descriptions[section]}
              </p>
            </div>
          </div>
          {notice && (
            <div
              role={notice.error ? "alert" : "status"}
              className={`mb-5 flex items-center gap-3 rounded-lg border p-4 text-sm ${notice.error ? "border-red-200 bg-red-50 text-destructive" : "border-emerald-200 bg-emerald-50 text-primary"}`}
            >
              {notice.error ? (
                <AlertCircle size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
              <span>{notice.message}</span>
              <button
                type="button"
                aria-label="Tutup pesan"
                onClick={() => setNotice(null)}
                className="ml-auto px-2"
              >
                ×
              </button>
            </div>
          )}
          {section === "dashboard" && <DashboardView profile={profile} />}
          {["products", "customers"].includes(section) && (
            <MasterView
              key={section}
              kind={section as "products" | "customers"}
              profile={profile}
              notify={notify}
            />
          )}{" "}
          {section === "pricing" && <PricingView notify={notify} />}{" "}
          {section === "drafts" && <DraftsView notify={notify} />}{" "}
          {section === "invoices" && (
            <InvoicesView
              profile={profile}
              notify={notify}
              initialId={initialInvoiceId}
            />
          )}{" "}
          {section === "payments" && <PaymentsView notify={notify} />}{" "}
          {section === "settings" && <SettingsView notify={notify} />}{" "}
          {section === "staff" && <StaffView notify={notify} />}{" "}
          {section === "audit" && <AuditView />}
          {section === "account" && <AccountView notify={notify} />}
          <footer className="mt-12 flex justify-between border-t border-border pt-5 text-[10px] text-muted-foreground">
            <span>GMI • Ruang kerja bisnis</span>
            <span>Semua nilai dalam Rupiah</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
