"use client";
import { useState } from "react";
import { Plus, Save, ShieldCheck } from "lucide-react";
import type { Settings, Profile, Category, Audit } from "@/lib/types";
import { dateID } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import {
  api,
  useData,
  useList,
  ListToolbar,
  DataState,
  Field,
  Badge,
  type Notify,
} from "./data";
export function SettingsView({ notify }: { notify: Notify }) {
  const state = useData<{ data: Settings[] }>("list/settings"),
    [busy, setBusy] = useState(false),
    [logo, setLogo] = useState<string | null | undefined>(undefined);
  const s = state.data?.data[0];
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget),
        data = Object.fromEntries(f.entries());
      await api("settings", {
        data: { ...data, tax_enabled: f.get("tax_enabled") === "on", logo_path: logo === undefined ? s.logo_path : logo },
        expected_version: s.version,
      });
      state.refresh();
      notify(
        "Pengaturan berhasil disimpan. Invoice yang sudah terbit tetap memakai detail lama.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <DataState loading={state.loading} error={state.error}>
      {s && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-6 font-semibold">
              Identitas & preferensi perusahaan
            </h2>
            <form onSubmit={submit} className="space-y-6">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Nama perusahaan" id="company_name">
                  <Input
                    id="company_name"
                    name="company_name"
                    defaultValue={s.company_name}
                    required
                    maxLength={200}
                  />
                </Field>
                <Field label="Email / telepon / situs" id="contact">
                  <Input
                    id="contact"
                    name="contact"
                    defaultValue={s.contact}
                    maxLength={500}
                  />
                </Field>
                <Field label="Alamat perusahaan" id="company_address">
                  <textarea
                    id="company_address"
                    name="address"
                    defaultValue={s.address}
                    rows={3}
                    maxLength={1000}
                  />
                </Field>
                <div>
                  <label htmlFor="logo">
                    Logo perusahaan (PNG/JPEG, maksimal 2 MB)
                  </label>
                  <Input
                    id="logo"
                    type="file"
                    accept="image/png,image/jpeg"
                    disabled={busy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setBusy(true);
                      try {
                        const form = new FormData();
                        form.set("file", file);
                        const r = await fetch("/api/logo", {
                          method: "POST",
                          body: form,
                        });
                        const d = await r.json();
                        if (!r.ok) throw new Error(d.error);
                        setLogo(d.path);
                        notify(
                          "Logo diunggah. Simpan pengaturan untuk menggunakannya.",
                        );
                      } catch (e) {
                        notify((e as Error).message, true);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {logo === null
                      ? "Logo dihapus dari pengaturan."
                      : logo || s.logo_path
                        ? "Logo tersedia untuk PDF invoice."
                        : "Belum ada logo."}
                  </p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLogo("brand:gmi-logo")}>
                    Gunakan logo GMI
                  </Button>
                  {(logo || s.logo_path) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setLogo(null)}
                    >
                      Hapus logo
                    </Button>
                  )}
                </div>
              </div>
              <div className="border-t border-border pt-6">
                <h3 className="mb-4 text-sm font-semibold">
                  Default kalkulasi
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      { key: "tax_percent", label: "Pajak penjualan (%)" },
                      { key: "profit_percent", label: "Target profit (%)" },
                      {
                        key: "marketing_percent",
                        label: "Biaya pemasaran (%)",
                      },
                      {
                        key: "operational_percent",
                        label: "Biaya operasional (%)",
                      },
                    ] as const
                  ).map((f) => (
                    <Field key={f.key} label={f.label} id={f.key}>
                      <Input
                        id={f.key}
                        name={f.key}
                        type="number"
                        min="0"
                        max={f.key === "profit_percent" ? "1000" : "100"}
                        step="0.01"
                        defaultValue={s[f.key]}
                        required
                      />
                    </Field>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="tax_enabled" defaultChecked={s.tax_enabled ?? Number(s.tax_percent) > 0} />Pajak aktif secara default</label>
                  <Field label="Nama pajak" id="tax_name"><Input id="tax_name" name="tax_name" defaultValue={s.tax_name ?? "PPN"} maxLength={100} required /></Field>
                  <Field label="Perlakuan pajak default" id="tax_mode"><select id="tax_mode" name="tax_mode" defaultValue={s.tax_mode ?? "added"}><option value="added">Ditambahkan</option><option value="included">Termasuk harga</option></select></Field>
                  <Field label="Dasar pajak default" id="tax_base"><select id="tax_base" name="tax_base" defaultValue={s.tax_base ?? "products_shipping"}><option value="products">Produk saja</option><option value="products_shipping">Produk dan ongkir</option></select></Field>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Pengaturan ini menjadi nilai awal kalkulator; pengguna dapat
                  memilih perlakuan dan dasar pajak pada tiap transaksi. Pajak
                  dipisahkan dari profit. Persentase biaya harus menghasilkan
                  penyebut positif.
                </p>
              </div>
              <div className="max-w-md border-t border-border pt-6">
                <Field label="Awalan nomor invoice" id="invoice_prefix">
                  <Input
                    id="invoice_prefix"
                    name="invoice_prefix"
                    defaultValue={s.invoice_prefix}
                    pattern="[A-Z0-9\x2d]{1,16}"
                    maxLength={16}
                    required
                  />
                </Field>
                <p className="mt-2 text-xs text-muted-foreground">
                  Format: AWALAN/TAHUN/000001. Nomor urut global tidak direset
                  setiap tahun.
                </p>
              </div>
              <Button disabled={busy}>
                <Save size={16} />
                {busy ? "Menyimpan…" : "Simpan pengaturan"}
              </Button>
            </form>
          </Card>
          <CategoriesView notify={notify} />
        </div>
      )}
    </DataState>
  );
}
function CategoriesView({ notify }: { notify: Notify }) {
  const list = useList<Category>("operational_categories"),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      await api("master", {
        kind: "operational_categories",
        data: { name: new FormData(form).get("name") },
      });
      form.reset();
      list.refresh();
      notify("Kategori operasional ditambahkan.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-6">
      <h2 className="font-semibold">Kategori biaya operasional</h2>
      <p className="my-3 text-xs leading-5 text-muted-foreground">
        Kategori biaya seperti sewa, gaji, dan listrik dapat dipilih pada
        kalkulator; persentase tiap kategori dimasukkan per transaksi.
      </p>
      <form onSubmit={submit} className="mb-5 flex max-w-md gap-2">
        <Input
          aria-label="Nama kategori"
          name="name"
          placeholder="Contoh: Sewa tempat"
          required
        />
        <Button disabled={busy}>
          <Plus size={15} />
          Tambah
        </Button>
      </form>
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
        <div className="divide-y divide-border">
          {list.data?.data.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-3">
              <span className="text-sm">{c.name}</span>
              <Badge>{c.archived ? "Diarsipkan" : "Aktif"}</Badge>
              <Button
                className="ml-auto"
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await api("master", {
                      kind: "operational_categories",
                      data: { ...c, archived: !c.archived },
                      record_id: c.id,
                      expected_version: c.version,
                    });
                    list.refresh();
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                }}
              >
                {c.archived ? "Aktifkan" : "Arsipkan"}
              </Button>
            </div>
          ))}
        </div>
      </DataState>
    </Card>
  );
}
export function StaffView({ notify }: { notify: Notify }) {
  const list = useList<Profile>("profiles"),
    [create, setCreate] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      await api("staff/create", Object.fromEntries(f.entries()));
      setCreate(false);
      list.refresh();
      notify(
        "Akun staf dibuat dalam keadaan nonaktif. Tetapkan peran dan aktifkan di bawah.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => setCreate(!create)}>
          <Plus size={16} />
          Buat akun staf
        </Button>
      </div>
      {create && (
        <Card className="mb-6 p-6">
          <h2 className="mb-4 font-semibold">Akun baru</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Nama staf" id="staff-name">
                <Input id="staff-name" name="name" required maxLength={200} />
              </Field>
              <Field label="Email staf" id="staff-email">
                <Input
                  id="staff-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Kata sandi awal (minimal 12 karakter)"
                id="staff-pass"
              >
                <Input
                  id="staff-pass"
                  name="password"
                  type="password"
                  minLength={12}
                  required
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Sampaikan kata sandi melalui kanal internal Anda. Staf dapat
              menggantinya melalui halaman Akun saya.
            </p>
            <Button disabled={busy}>
              {busy ? "Membuat…" : "Buat akun nonaktif"}
            </Button>
          </form>
        </Card>
      )}
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
          <div className="divide-y divide-border">
            {list.data?.data.map((p) => (
              <StaffRow
                key={`${p.id}-${p.version}`}
                profile={p}
                notify={notify}
                refresh={list.refresh}
              />
            ))}
          </div>
        </DataState>
      </Card>
    </>
  );
}
function StaffRow({
  profile: p,
  notify,
  refresh,
}: {
  profile: Profile;
  notify: Notify;
  refresh: () => void;
}) {
  const [role, setRole] = useState(p.role),
    [active, setActive] = useState(p.active),
    [name, setName] = useState(p.name),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="grid items-end gap-4 p-5 md:grid-cols-[2fr_1fr_1fr_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("staff", {
            staff_id: p.id,
            staff_name: name,
            staff_role: role,
            staff_active: active,
            expected_version: p.version,
          });
          refresh();
          notify("Akses staf diperbarui.");
        } catch (e) {
          notify((e as Error).message, true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Nama" id={`name-${p.id}`}>
        <Input
          id={`name-${p.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label="Peran" id={`role-${p.id}`}>
        <select
          id={`role-${p.id}`}
          value={role}
          onChange={(e) => setRole(e.target.value as Profile["role"])}
        >
          <option value="admin">Admin</option>
          <option value="sales">Sales</option>
          <option value="finance">Finance</option>
        </select>
      </Field>
      <label className="flex h-10 items-center gap-2">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Akun aktif
      </label>
      <Button variant="outline" disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan akses"}
      </Button>
    </form>
  );
}
export function AuditView() {
  const list = useList<Audit>("audit_log");
  return (
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
                <th>Waktu</th>
                <th>Pelaku</th>
                <th>Tindakan</th>
                <th>Data</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.data.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">
                    {dateID(a.created_at)}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleTimeString("id-ID")}
                    </p>
                  </td>
                  <td className="max-w-36 break-all text-xs">
                    {a.actor_id || "Sistem"}
                  </td>
                  <td>
                    <Badge>{a.action}</Badge>
                  </td>
                  <td>
                    {a.entity}
                    <p className="mt-1 max-w-40 break-all text-[10px] text-muted-foreground">
                      {a.record_id}
                    </p>
                  </td>
                  <td>
                    <details>
                      <summary className="cursor-pointer text-xs text-primary">
                        Lihat detail
                      </summary>
                      <pre className="mt-2 max-w-sm overflow-auto rounded bg-muted p-2 text-[10px]">
                        {JSON.stringify(a.details, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
    </Card>
  );
}
export function AccountView({ notify }: { notify: Notify }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card className="max-w-lg p-6">
      <h2 className="mb-5 flex items-center gap-2 font-semibold">
        <ShieldCheck size={19} />
        Ganti kata sandi
      </h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          if (f.get("password") !== f.get("confirm")) {
            notify("Konfirmasi kata sandi tidak cocok.", true);
            return;
          }
          setBusy(true);
          try {
            await api("password", { password: f.get("password") });
            form.reset();
            notify("Kata sandi diperbarui.");
          } catch (e) {
            notify((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-4"
      >
        <Field label="Kata sandi baru (minimal 12 karakter)" id="new-password">
          <Input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </Field>
        <Field label="Ulangi kata sandi baru" id="confirm-password">
          <Input
            id="confirm-password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </Field>
        <Button disabled={busy}>
          {busy ? "Menyimpan…" : "Perbarui kata sandi"}
        </Button>
      </form>
    </Card>
  );
}
