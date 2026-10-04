import "server-only";
import { serverClient } from "./supabase";
import type { Profile, Role } from "./types";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireStaff(roles?: Role[]) {
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    throw new HttpError(401, "Silakan masuk terlebih dahulu.");
  const { data: profile, error: err } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (err || !profile?.active)
    throw new HttpError(403, "Akun belum aktif. Hubungi Admin.");
  if (roles && !roles.includes(profile.role))
    throw new HttpError(403, "Anda tidak memiliki izin untuk tindakan ini.");
  return { db, user, profile: profile as Profile };
}
export function checkError(error: { message: string; code?: string } | null) {
  if (!error) return;
  const messages: Record<string, string> = {
    PGRST116: "Data tidak ditemukan atau tidak dapat diakses.",
    23505: "Data duplikat. SKU atau nomor unik sudah digunakan.",
    23514:
      "Data tidak memenuhi aturan validasi. Periksa nama, nominal, dan persentase.",
    23502: "Lengkapi semua kolom yang wajib diisi.",
    22003: "Nominal transaksi melebihi kapasitas database.",
    22007: "Tanggal tidak valid.",
  };
  throw new HttpError(
    error.code === "42501"
      ? 403
      : error.code === "40001" || error.code === "23505"
        ? 409
        : error.code === "PGRST116"
          ? 404
          : 400,
    messages[error.code || ""] || error.message,
  );
}
