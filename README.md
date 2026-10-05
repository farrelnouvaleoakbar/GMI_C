# Global Medika Indonesia — aplikasi manajemen bisnis

Aplikasi bisnis berbahasa Indonesia untuk katalog, pelanggan, kalkulasi harga, draf, invoice PDF privat, pembayaran manual, dashboard, pengaturan, staf, dan audit. Next.js App Router + React + TypeScript, Tailwind CSS v4, komponen shadcn/ui berbasis Radix, Decimal.js, pdf-lib, Supabase PostgreSQL/Auth/Storage. Hosting frontend dan API di Vercel. Tidak memerlukan cloud lain, SMTP eksternal, gateway pembayaran, atau Redis.

Data bisnis disimpan di Supabase. Tanpa konfigurasi, aplikasi menampilkan petunjuk setup dan tidak menyediakan data bisnis palsu atau login demo.

## Setup lokal (Node.js + npm)

Gunakan Node.js **22.16+** (disarankan Node 22 LTS) dan npm 10+. Dari folder proyek:

```sh
npm ci
cp .env.example .env.local
# Isi nilai Supabase di .env.local.
npm run dev
```

Buka http://localhost:3000. Jalankan migrasi dan buat Admin sesuai langkah berikut sebelum login. `npm run build` lalu `npm start` menjalankan versi produksi lokal. `npm run lint` memakai Biome; `npm run format` memakai Prettier.

## Supabase dan migrasi

1. Buat proyek Supabase baru. Gunakan satu proyek untuk satu perusahaan.
2. Di SQL Editor, jalankan file berikut **berurutan**, sekali pada database baru:
   - `supabase/migrations/202610040001_core.sql`
   - `supabase/migrations/202610040002_dashboard.sql`
   - `supabase/migrations/202610040003_decimal_views.sql`
   - `supabase/migrations/202610040004_calculator_options.sql`
   - `supabase/migrations/202610040005_gmi_catalog.sql`
   - `supabase/migrations/202610050001_calculator_profit_reconciliation.sql`
3. Migrasi membuat tabel, indeks, constraints, RLS, transactional RPC, view uang sebagai teks, trigger profil staf, dan dua bucket **privat**: `invoice-pdfs` dan `company-assets`. Tidak perlu membuat bucket lagi melalui UI.
4. Di **Authentication → konfigurasi signup/provider**, matikan **Allow new users to sign up**. Matikan login anonim dan provider sosial yang tidak digunakan. Pertahankan email/password. `supabase/config.toml` juga mematikan signup untuk pengembangan dengan CLI; file ini **tidak otomatis mengubah konfigurasi proyek hosted**.
5. Di pengaturan API proyek, ambil URL proyek dan anon key. Di pengaturan API keys, ambil legacy `service_role` key untuk operasi Admin dan Storage server. Isi `.env.local` sesuai tabel di bawah.
6. Jangan menjalankan `supabase/tests/platform-stub.sql` pada Supabase. File itu hanya untuk test PostgreSQL terisolasi.

Opsional bila memakai Supabase CLI yang terpasang:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Pilih SQL Editor **atau** CLI migration workflow dari awal. Jangan menerapkan migrasi yang sama dua kali. Docker/Supabase CLI tidak dibutuhkan untuk menjalankan frontend atau pengujian otomatis biasa.

Kalkulator menagihkan ongkir sekali dan mengalokasikan rekomendasi harga produk menurut bagian modal tiap baris. Harga manual tidak pernah dinaikkan otomatis. Ongkir kosong berarti belum diketahui dan menghasilkan estimasi sementara; tetapkan ongkir (termasuk Rp0 bila memang gratis) sebelum menerbitkan invoice. Default operasional umum berlaku sampai pengguna memilih kategori; tarif kategori lalu menggantikan tarif umum. Tarif dan pilihan pajak tersimpan pada input draf dan dibekukan dalam snapshot invoice. Katalog GMI memisahkan barang per unit/per box serta harga daftar dari modal aktual. Modal aktual harus dimasukkan Admin sebelum produk dapat dipakai menghitung transaksi.

## Membuat Admin pertama

Setelah migrasi:

1. Buka **Authentication → Users → Add user** di Supabase Dashboard.
2. Buat akun email/password; pilih **Auto Confirm User**. Gunakan kata sandi kuat, minimal 12 karakter. Trigger database membuat profil Sales yang **nonaktif**.
3. Buka `supabase/bootstrap-admin.sql`, ganti `REPLACE_WITH_ADMIN_EMAIL` dengan email tersebut, dan jalankan di SQL Editor. Script mengaktifkan Admin pertama dan membuat audit event. Script menolak berjalan jika sudah ada Admin aktif.
4. Login pada aplikasi. Migrasi GMI mengisi nama perusahaan dan logo GMI sebagai bawaan, tanpa mengisi alamat/kontak yang tidak tersedia pada sumber. Buka **Pengaturan** untuk melengkapi identitas serta memeriksa pajak dan default harga.
5. Buka **Manajemen staf → Buat akun staf**. Akun dibuat nonaktif tanpa pengiriman email. Tetapkan peran dan aktifkan melalui **Simpan akses**. Sampaikan kata sandi awal melalui kanal internal. Staf mengganti kata sandinya melalui **Akun saya**.

Admin aktif terakhir tidak dapat dinonaktifkan atau diturunkan perannya. Untuk lupa kata sandi, operator terpercaya dapat mengganti kata sandi user melalui Supabase Dashboard. Tidak ada alur email recovery atau signup publik dalam aplikasi ini.

## Memasang katalog dan identitas GMI

Untuk database yang sudah menjalankan migrasi sampai 004, jalankan `supabase/migrations/202610040005_gmi_catalog.sql`, lalu `supabase/migrations/202610050001_calculator_profit_reconciliation.sql` di SQL Editor. Database yang sudah sampai 005 hanya perlu migrasi `202610050001_calculator_profit_reconciliation.sql`. Jangan jalankan ulang migrasi lama. Setelah itu jalankan `supabase/seeds/gmi_catalog.sql` untuk 139 referensi per test/per box EGENS, New Standareagen, Standareagen AKD, ESIGHT, dan SINY. Harga daftar mengikuti PPN incl. pada workbook; tanggal daftar GMI Juli 2026 dan harga SINY Januari 2024. Untuk mengisi semua 139 modal dari angka yang tersedia, jalankan `supabase/seeds/gmi_catalog_modal_estimates.sql`: 136 harga jual GMI dihitung menjadi estimasi modal dengan rumus `(harga daftar / 1,11) / 1,20`, HALF_UP dua desimal; 3 harga pemasok SINY 2024 dipakai sebagai referensi modal lama dan perlu diverifikasi. Seed hanya mengisi biaya yang masih kosong dan mempertahankan modal aktual yang sudah ada.

Untuk membuat ulang seed GMI, jalankan `python3 scripts/import-gmi-catalog.py '/path/HARGA GMI 2026 - Adinda.xlsx'`. Atas pilihan pengguna, 15 produk kasa dari `Proyeksi & Survey Katalog.xlsx` juga dimasukkan sebagai modal estimasi per unit melalui `supabase/seeds/gmi_kasa_estimated_modal.sql`. Nilainya dihitung dari harga pasar/unit dengan asumsi margin 20%; itu bukan modal terkonfirmasi pemasok. Kategori internal menandai modal GMI sebagai estimasi dan SINY sebagai harga pemasok 2024 yang perlu dicek; kategori tidak dicetak pada invoice pelanggan. Perbarui modal dan kategori ketika tersedia biaya aktual. Data survei sumber tersimpan di `supabase/seeds/gmi_market_survey.csv`. `GMI-Draft.pdf` berisi logo saja; logo kerja tersimpan di `public/brand/gmi-logo.png`. File supplier SINY memuat alamat pemasok, bukan alamat GMI; alamat/kontak perusahaan dibiarkan kosong sampai Admin melengkapinya.

## Environment variables

| Variable | Kegunaan | Lokasi |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek Supabase | Lokal dan Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key untuk session Auth/RLS | Lokal dan Vercel; boleh publik |
| `SUPABASE_SERVICE_ROLE_KEY` | Buat akun staf dan akses Storage setelah otorisasi | **Server saja**, jangan pakai awalan `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | Origin aplikasi, mis. `https://gmi.example.com` | Lokal dan Vercel |
| `TEST_DATABASE_URL` | Koneksi PostgreSQL langsung untuk tes konkurensi opsional | Lokal/CI, hanya database disposable |
| `ACK_DISPOSABLE_DATABASE` | Isi `yes` untuk menjalankan tes konkurensi | Lokal/CI, tidak perlu di Vercel |

`.env.example` berisi placeholder saja. `.env.local` diabaikan git. Service key hanya diakses modul `server-only`; endpoint bisnis memakai session user dan RLS, bukan service key. Jangan menambahkan database URL atau service key ke kode browser.

## Deploy ke Vercel

1. Masukkan repo ini ke Git provider Anda, lalu **Import Project** di Vercel. Pilih framework **Next.js**, root folder proyek ini, install `npm ci`, build `npm run build`.
2. Pilih Node.js **22.x** pada Project Settings.
3. Isi keempat environment variables aplikasi di atas untuk **Production**. Gunakan proyek Supabase staging terpisah untuk Preview bila dibutuhkan.
4. Deploy. Sesudah memperoleh domain final, ubah `NEXT_PUBLIC_APP_URL` menjadi origin HTTPS final, tanpa trailing slash, lalu **redeploy**.
5. Di Supabase **Authentication → URL Configuration**, set **Site URL** ke origin produksi. Tambahkan Redirect URLs `https://DOMAIN_PRODUKSI/**` dan `http://localhost:3000/**`. Tambahkan hanya domain preview yang Anda kendalikan bila diperlukan. Login email/password aplikasi ini tidak membutuhkan callback OAuth, tetapi konfigurasi URL tetap harus benar untuk operasi Auth.
6. Pastikan signup tetap dimatikan di proyek hosted. Login sebagai Admin, kemudian uji Sales dan Finance, unduh PDF, dan catat pembayaran kecil pada data staging.

API memakai runtime Node.js Vercel. Penerbitan invoice berkomit di database sebelum PDF dibuat; kegagalan Storage/PDF tidak membatalkan atau menerbitkan ulang invoice. Klik **Unduh PDF** untuk mencoba lagi dengan snapshot dan nomor yang sama. Tidak ada cron atau worker cloud wajib.

Referensi konfigurasi: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [bucket privat](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Alur penggunaan

1. Admin menambah produk dan modal per unit; Admin atau Sales menambah pelanggan.
2. Di **Kalkulator harga**, pilih pelanggan, produk, jumlah, ongkir pesanan, persentase, pembulatan, dan harga manual bila diperlukan.
3. Klik **Hitung harga**. Server membaca modal dari katalog, memvalidasi persentase dan penyebut, serta menghitung uang dengan Decimal.js. RPC memverifikasi ulang dengan PostgreSQL `numeric`.
4. Tinjau rincian internal dan pratinjau pelanggan. Klik **Simpan draf** di samping hasil kalkulasi. Draf tersimpan dapat dibuka kembali dan diunduh sebagai PDF bertanda **BELUM DITERBITKAN** dari **Draf transaksi**. Kerugian memerlukan konfirmasi atas hash perhitungan dan versi saat ini.
5. Buka ulang draf, hitung/tinjau, lalu **Terbitkan invoice**. Draf harus sudah tersimpan dan hasil yang ditinjau harus cocok dengan katalog, customer, dan pengaturan saat penerbitan. Jika berubah, hitung ulang dan simpan lagi.
6. Invoice membekukan identitas perusahaan/pelanggan, produk, modal internal, harga, persentase, pajak, tanggal jatuh tempo, dan catatan. PDF pelanggan hanya memuat detail tagihan, tanpa modal, biaya internal, atau profit.
7. Admin atau Finance mencatat pembayaran parsial/penuh dari detail invoice. Saldo dihitung transaksional.
8. **Duplikasi** membuat draf baru dari input asli. **Buat revisi** membuat draf baru yang terhubung ke invoice asal. Harga dihitung dari katalog terbaru. Revisi tidak membatalkan invoice asal.
9. Pembatalan membutuhkan alasan minimal 5 karakter. Invoice dengan pembayaran aktif harus menunggu pembatalan pembayaran oleh Finance/Admin. Riwayat dan audit tetap tersimpan.

## Asumsi finansial dan aturan bisnis

- **Basis per unit:** `B` = modal produk per unit, `S` = alokasi ongkir per unit, `P` = harga jual barang per unit **sebelum ongkir terpisah dan pajak**. Kuantitas merupakan bilangan bulat 1–1.000.000; maksimum 100 baris per draf.
- **Alokasi ongkir:** `S = ongkir pesanan / jumlah seluruh unit`, sama untuk setiap unit, tanpa pembulatan alokasi sebelum rumus. Formula SQL menyederhanakan rasio agar tidak kehilangan presisi alokasi berulang. Ongkir pesanan ditagihkan **sekali**, bukan pada setiap baris. Jumlah ongkir yang ditagihkan sama dengan biaya ongkir yang dimasukkan.
- **Rumus:** `P = [B × (1+p) + p×S] / [1−m−o×(1+p)]`. Interface menerima `20` untuk 20%; server menggunakan `0.20`. Target profit 0–1000%, marketing dan operasional 0–100%. Penyebut harus positif.
- **Profit:** pendapatan barang + ongkir − modal − biaya ongkir − pemasaran − operasional. Karena ongkir ditagihkan sebesar biayanya, estimasi profit = subtotal barang − modal − pemasaran − operasional. Pemasaran dan operasional dihitung terhadap **harga jual barang**, per baris. Rumus menargetkan profit sebesar `p × (B + S + o×P)` sebelum efek pembulatan. Profit adalah estimasi, bukan laporan akuntansi biaya aktual.
- **Pembulatan:** nominal HALF_UP dua desimal. Harga rekomendasi dibulatkan dua desimal dahulu, lalu opsional dinaikkan ke kelipatan Rp100, Rp500, atau Rp1.000. Harga manual menggantikan pilihan rekomendasi; estimasi profit langsung dihitung ulang. Biaya marketing/operasional dibulatkan per baris; profit total merupakan jumlah profit baris.
- **Pajak:** default 0%; Admin menentukan tarif yang sesuai. Pajak = HALF_UP `(subtotal barang + ongkir) × tarif`, ditampilkan terpisah, dan bukan profit. Tidak ada faktur pajak elektronik atau integrasi pajak resmi.
- **Nomor:** `PREFIX/TAHUN/000001`, satu nomor urut global yang tidak direset tahunan. Prefix 1–16 karakter A–Z/0–9/`-`. Pembatalan tidak menggunakan ulang nomor. Pengaturan nomor tidak menyediakan reset counter untuk menghindari duplikasi.
- **Penjualan dashboard:** nilai bruto invoice termasuk ongkir dan pajak, sepanjang invoice tidak dibatalkan. Penerimaan = pembayaran aktif; sisa = total − pembayaran aktif. Grafik bulanan memakai waktu penerbitan `Asia/Jakarta`; timestamp database disimpan `timestamptz`.
- **Kepemilikan:** pelanggan/draf baru menjadi milik pembuatnya. Admin mengelola semua; Sales hanya pelanggan/draf/invoice miliknya; Finance melihat master data untuk referensi, seluruh invoice/pembayaran, dan mengelola pembayaran, tanpa izin mengubah master, draf, penerbitan, atau pengaturan. Tidak ada transfer ownership lintas Sales pada UI.
- **Kategori operasional:** daftar administratif seperti gaji, sewa, listrik. Perhitungan memakai satu tarif operasional gabungan per baris; kategori tidak otomatis menambahkan biaya kedua kali.
- **Saldo negatif/overpayment** ditolak. Pembayaran nol, pecahan lebih dari dua desimal, tanggal masa depan, invoice dibatalkan, atau kunci retry yang dipakai dengan payload berbeda juga ditolak. Metode manual tidak menghubungkan bank/gateway.
- **Batas nominal:** modal/harga per unit/ongkir maksimal Rp1 triliun. Database memakai `numeric(18,2)` untuk jumlah akhir; transaksi yang melebihi kapasitas ditolak. View API mengirim uang sebagai teks agar JSON tidak menghilangkan presisi.

## Struktur dan pengamanan

| Area | Implementasi |
| --- | --- |
| Database/Auth | `supabase/migrations/`, `src/lib/auth.ts`, `src/lib/supabase.ts`, `src/proxy.ts` |
| Produk/pelanggan | `save_product`/`save_master`, version checks, RLS, `src/components/masters.tsx` |
| Kalkulasi | `src/lib/pricing.ts`, `private.calculate`, preview hash, `src/components/pricing.tsx` |
| Invoice | `save_draft`, `issue_invoice`, row/catalog/settings locks, snapshot, nomor unik dan `draft_id` unik |
| Pembayaran | `record_payment`, advisory key lock + row lock invoice, retry payload match, `cancel_payment` |
| PDF | `src/lib/pdf.ts`, `src/lib/private-pdf.ts`, private bucket dan download API berotorisasi |
| Dashboard | SQL aggregate dengan RLS; list paginasi 50 baris tidak membatasi ringkasan |
| UI/API | `src/components/`, `src/app/api/[...path]/route.ts` |

Semua tabel memiliki RLS. Browser tidak memiliki grants write pada tabel bisnis; mutations melalui RPC `SECURITY DEFINER` dengan `search_path=''`, pemeriksaan akun aktif, peran, ownership, dan grants EXECUTE terbatas. RLS pada view memakai `security_invoker=true`. Service key dipakai hanya untuk Auth Admin dan Storage setelah verifikasi staff. Tidak ada URL PDF publik atau cache bersama untuk data terautentikasi. Origin pada mutation diperiksa; login diverifikasi melalui `getUser`, bukan user metadata atau session yang dipercaya begitu saja.

Konfirmasi rugi adalah hash SHA-256 atas snapshot kalkulasi dan versi draf. Perubahan input, modal, customer, atau pengaturan mengganti hash. Penerbitan juga menuntut hash draf tersimpan cocok dengan hasil terbaru. Retry penerbitan pada draf yang sama mengembalikan invoice yang sama. Retry pembayaran memakai UUID unik dan payload yang sama, disimpan pada `sessionStorage` sebelum pengajuan; setelah reload tab dapat melanjutkan pengajuan. Jangan membuang pengajuan yang responsnya hilang sebelum memeriksa riwayat.

Logo memakai nama file UUID baru, tidak menimpa logo lama. Invoice lama menunjuk file logo yang dibekukan. PDF dibangun dari snapshot tersimpan; file diterbitkan dan file pembatalan terpisah. Audit append-only mencatat actor, timestamp, tindakan, record, dan rincian; profil staf tidak bisa mengubahnya melalui API.

## Pengujian

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

`npm test` menjalankan uji kalkulasi dan izin TypeScript, PDF, serta **migrasi PostgreSQL nyata melalui PGlite**. Platform stub hanya mensimulasikan schema Auth/Storage dan claim user; RLS, constraints, PL/pgSQL, transaksi, dan grants dijalankan oleh mesin PostgreSQL. Tidak membutuhkan Supabase credentials. Lihat `CHECKS.md` untuk hasil dan batas verifikasi.

Tes konkurensi multi-koneksi opsional memerlukan proyek Supabase **disposable** yang sudah dimigrasi. Jangan jalankan pada produksi. Gunakan koneksi direct atau session pooler (bukan transaction pooler untuk pengujian ini) dan credential database dengan izin test setup. Jalankan setelah memuat variable berikut melalui shell Anda:

```sh
export TEST_DATABASE_URL='postgresql://postgres:PLACEHOLDER@TEST_HOST:5432/postgres'
export ACK_DISPOSABLE_DATABASE=yes
npm run test:db
```

Tes membuat fixture dengan UUID acak, memeriksa issuance bersamaan, retry pembayaran bersamaan, dan overpayment bersamaan, lalu membersihkan fixture. Nomor invoice yang terpakai tidak direset. Script tidak menerapkan migrasi atau mengubah konfigurasi Auth.

## Tahapan implementasi

1. Schema, trigger profil nonaktif, Auth server/session, role checks, RLS, bootstrap Admin.
2. Katalog dan pelanggan dengan ownership, archive, search, version checks.
3. Harga server Decimal.js dan PostgreSQL numeric, alokasi ongkir, pajak, pembulatan, konfirmasi rugi.
4. Draf, review, penerbitan transaksional/idempotent, snapshot, PDF privat, duplikasi/revisi/pembatalan.
5. Pembayaran parsial/penuh, idempotensi, row locks, pembatalan dan audit.
6. Dashboard aggregate per izin, manajemen staf/pengaturan, UI Indonesia, pengujian dan deployment docs.

## Batas operasional

- Kredensial/proyek Supabase dan akun Vercel harus disediakan operator. Repo ini tidak membuat atau menerapkan resource cloud secara otomatis.
- Tes lokal tidak menjalankan Supabase Auth HTTP, PostgREST, Storage HTTP, atau deployment Vercel sebenarnya. Tes konkurensi multi-koneksi disediakan terpisah. Lakukan smoke test staging setelah konfigurasi.
- Form selector produk/pelanggan mengambil seluruh master aktif melalui fetch paginasi; untuk katalog sangat besar, ganti dengan autocomplete server. Tabel daftar dipaginasi, dashboard mengagregasi seluruh data yang diizinkan.
- PDF memakai font standar Helvetica/Latin. Label Indonesia didukung; karakter non-Latin di nama/alamat diganti `?`. Tidak ada font cloud eksternal. PDF dibuat sinkron; retry manual tersedia, tanpa background queue.
- PDF draf dibuat saat diminta dari snapshot draf, ditandai belum diterbitkan, dan tidak disimpan ke Storage. PDF invoice terbit tetap privat dan disimpan di bucket `invoice-pdfs`.
- Pembayaran manual tidak memiliki refund/cash-disbursement ledger. Pembatalan adalah koreksi pencatatan; perpindahan uang nyata tetap ditangani tim Finance.
- Tidak termasuk inventory, kurs, multi-perusahaan, payment gateway, reminder otomatis, diskon, atau layanan email tambahan.
