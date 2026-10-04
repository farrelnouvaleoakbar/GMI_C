"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg p-12">
      <h1 className="text-xl font-semibold">Ruang kerja belum dapat dimuat</h1>
      <p className="my-4 text-sm">
        Periksa koneksi dan konfigurasi Supabase, lalu coba kembali.
      </p>
      <Button onClick={reset}>Coba kembali</Button>
    </main>
  );
}
