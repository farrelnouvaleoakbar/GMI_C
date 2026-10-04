# Laporan verifikasi

Tanggal: 4 Oktober 2026. Pemeriksaan dilakukan pada Node.js 22.16.0/npm 10.9.2 di workspace lokal. Tidak ada kredensial bisnis nyata atau data produksi yang digunakan.

## Pemeriksaan yang berhasil

| Pemeriksaan | Hasil |
| --- | --- |
| `npm test` | **55/55 lulus**, empat file tes |
| `npm run typecheck` | Lulus, TypeScript strict |
| `npm run lint` | Lulus tanpa error/warning |
| `npm run build` | Build produksi Next.js berhasil menggunakan Webpack |
| `npm ci` | Instalasi bersih berhasil: 154 paket, tanpa peringatan deprecated, dan 0 kerentanan dalam audit install |
| `npm audit` | **0 kerentanan** di seluruh dependency tree, termasuk development tools (diverifikasi kembali 4 Oktober 2026) |
| `npm run lint` | Biome memeriksa 34 file; lulus tanpa error atau warning |
| GMI catalog import | Parser workbook menghasilkan 139 baris referensi. Semua `purchase_price` bernilai SQL `NULL`; harga SINY diberi tanggal/sumber 2024 dan data survei kasa dipisah dari katalog |
| GMI modal estimates | 136 harga jual dikonversi memakai `/1.11/1.20`; tiga harga SINY 2024 dipakai sebagai referensi modal lama. Seed aman untuk diulang tanpa menimpa modal non-NULL |
| HTTP production server | `/login` mengembalikan 200, HTML `lang="id"`, formulir login dan petunjuk setup |
| Proteksi halaman | `/dashboard` tanpa konfigurasi mengembalikan redirect streaming Next.js ke `/login`; tidak memuat data bisnis |

Build Turbopack awal gagal karena subprocess mencoba membuka port yang diblokir lingkungan sandbox, termasuk pada percobaan ulang dengan escalation. Build dan dev scripts menggunakan Webpack yang kompatibel dengan lingkungan ini. Production `next start` berhasil dijalankan dengan izin localhost; server dihentikan setelah smoke test.

## Cakupan tes

- **14 kalkulasi:** konversi 20% → 0.20, pecahan persen, akurasi rumus, penyebut nol/negatif, HALF_UP positif/negatif, pembulatan ke atas Rp100/Rp500/Rp1.000, alokasi ongkir, kategori operasional, tax-inclusive atas ongkir, ongkir provisional, pajak tidak mengubah profit, dan harga manual yang rugi.
- **4 izin TypeScript:** Admin, Sales/ownership, Finance, dan akun nonaktif.
- **33 tes PostgreSQL:** kelima migrasi diterapkan pada PostgreSQL PGlite terisolasi. Termasuk RLS, ownership, seed 139 referensi produk tanpa modal rekaan, seed biaya untuk 136 GMI price rows dan tiga SINY rows (termasuk pelestarian biaya aktual saat seed diulang), 15 modal estimasi Kasa dengan label sumber, server purchase cost, pajak termasuk, kategori biaya, ongkir provisional dan penolakan penerbitan invoice provisional, tanggal jatuh tempo, ditambah issuance/payment atomicity, optimistic version checks, snapshot, audit, dashboard, dan aturan peran.
- **4 PDF:** merek dan total muncul tanpa modal/profit/biaya internal; PDF draf ditandai belum diterbitkan dan menyembunyikan biaya internal; 100 baris menghasilkan PDF beberapa halaman yang tetap memuat baris terakhir; PDF pembatalan menampilkan alasannya.

RLS diuji dengan `SET LOCAL ROLE authenticated` dan identity claim berbeda, bukan dengan pemeriksaan string SQL saja. Kegagalan transaction diuji dengan memastikan invoice tidak tercipta dan counter nomor tetap sama. PDF diuji dengan membaca content streams PDF yang dihasilkan.

## Pemeriksaan yang belum dilakukan

- Login dan refresh session melalui Supabase Auth HTTP hosted.
- Query/filter PostgREST hosted dan upload/download melalui Supabase Storage HTTP.
- Smoke test alur penuh menggunakan tiga akun pada browser, termasuk layout mobile dan keyboard navigation.
- Deployment dan environment variables Vercel nyata.
- Race multi-koneksi pada Supabase PostgreSQL. PGlite menjalankan PostgreSQL lokal, tetapi tes biasa tidak mensimulasikan dua koneksi bersamaan. `scripts/test-db.mjs` menyediakan tes issuance bersamaan, retry pembayaran bersamaan, dan overpayment bersamaan untuk database disposable yang telah dimigrasi.

Pemeriksaan tersebut membutuhkan konfigurasi Supabase/Vercel milik operator. Tidak ada dummy persistence atau kredensial tertanam sebagai pengganti.

## Perbaikan audit dependency tree

`npm audit` sebelumnya melaporkan lima paket dalam satu kerentanan berulang: `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`. Advisory GitHub [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/ghsa-vfj7-8cjw-p6xm) menyatakan versi terdampak `<=3.0.3` dan belum mencantumkan versi patched. Karena belum ada rilis `braces` yang aman, mengganti versi melalui override akan menyembunyikan advisory tanpa memperbaiki kodenya.

Perbaikannya menghapus `eslint-config-next` dan `eslint` dari project serta mengganti script lint dengan Biome. Next.js tetap pada major 16; Biome memeriksa source, tes, dan skrip, sedangkan `npm run typecheck` dan Next production build tetap melakukan pemeriksaan TypeScript. `npm audit` setelah perubahan: **found 0 vulnerabilities**. Lockfile diperbarui agar `npm ci` menghasilkan dependency tree yang sama.

## Batas operasional

Font PDF standar mendukung Latin/label Indonesia; nama dengan karakter non-Latin diganti `?`. PDF invoice disimpan privat; PDF draf dibuat saat diminta dan tidak disimpan. PDF dibuat sinkron dan kegagalan invoice diulang melalui unduhan. Form selector memuat seluruh master aktif melalui pagination; optimalkan menjadi server autocomplete untuk katalog sangat besar. Katalog menyimpan satu modal per SKU (per-test/per-box terpisah). Modal GMI dan Kasa yang diimpor adalah estimasi dengan asumsi markup 20%; harga SINY berumur Januari 2024. Verifikasi atau ganti dengan biaya aktual saat tersedia. CSV survei pasar tidak ditampilkan di aplikasi. Kebijakan pajak/ongkir, nomor urut global, basis profit, batas nominal, dan hak tiap peran dijelaskan di README.
