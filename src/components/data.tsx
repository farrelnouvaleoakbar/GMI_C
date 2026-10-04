"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Inbox,
  LoaderCircle,
} from "lucide-react";
import { Input } from "./ui/input";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const d = await r.json();
  if (!r.ok) {
    if (r.status === 401)
      window.location.assign(new URL("/login", window.location.origin).href);
    throw new Error(d.error || "Permintaan gagal.");
  }
  return d;
}
export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    // Synchronize loading state with the external request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    api<T>(path)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, tick]);
  return { data, loading, error, refresh };
}
export function useList<T>(table: string, extra = "") {
  const [page, setPage] = useState(0),
    [search, setSearch] = useState("");
  const state = useData<{ data: T[]; count: number; page: number }>(
    `list/${table}?page=${page}&q=${encodeURIComponent(search)}${extra}`,
  );
  return { ...state, page, setPage, search, setSearch };
}
export function DataState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (loading)
    return (
      <div
        role="status"
        className="flex justify-center gap-2 p-12 text-sm text-muted-foreground"
      >
        <LoaderCircle className="animate-spin" size={18} />
        Memuat data…
      </div>
    );
  if (error)
    return (
      <p
        role="alert"
        className="rounded-lg bg-red-50 p-5 text-sm text-destructive"
      >
        {error}
      </p>
    );
  if (empty)
    return (
      <div className="flex flex-col items-center p-14 text-center">
        <Inbox size={32} className="mb-4 text-muted-foreground" />
        <p className="text-sm font-medium">Belum ada data</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Data yang Anda simpan akan tampil di sini.
        </p>
      </div>
    );
  return children;
}
export function ListToolbar({
  count,
  page,
  setPage,
  onSearch,
}: {
  count: number;
  page: number;
  setPage: (p: number) => void;
  onSearch: (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
      <form
        className="relative w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(String(new FormData(e.currentTarget).get("q") || ""));
          setPage(0);
        }}
      >
        <Search
          size={16}
          className="absolute left-3 top-3 text-muted-foreground"
        />
        <Input
          aria-label="Cari data"
          name="q"
          placeholder="Cari, lalu tekan Enter…"
          className="pl-9"
        />
      </form>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {count} data • Halaman {page + 1}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Halaman sebelumnya"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Halaman berikutnya"
          disabled={(page + 1) * 50 >= count}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
export function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "amber" | "red" | "gray";
}) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "red" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}
    >
      {children}
    </span>
  );
}
export function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
export type Notify = (message: string, error?: boolean) => void;
