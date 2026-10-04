"use client";
import { useState } from "react";
import { Plus, Pencil, Archive, Package, Users } from "lucide-react";
import type { Product, Customer, Profile } from "@/lib/types";
import { rupiah } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import {
  api,
  useList,
  ListToolbar,
  DataState,
  Badge,
  Field,
  type Notify,
} from "./data";
export function MasterView({
  kind,
  profile,
  notify,
}: {
  kind: "products" | "customers";
  profile: Profile;
  notify: Notify;
}) {
  const list = useList<Product | Customer>(kind),
    [edit, setEdit] = useState<Product | Customer | "new" | null>(null),
    [busy, setBusy] = useState(false);
  const product = kind === "products";
  const allowed = can(profile, product ? "product" : "customer");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      const data = {
        ...Object.fromEntries(f.entries()),
        archived: f.get("archived") === "true",
        list_price_tax_included: f.get("list_price_tax_included") === "on",
        list_price_source: f.get("list_price_source"),
        pack_quantity: f.get("pack_quantity") || null,
      };
      await api("master", {
        kind,
        data,
        record_id: edit && edit !== "new" ? edit.id : null,
        expected_version: edit && edit !== "new" ? edit.version : null,
      });
      setEdit(null);
      list.refresh();
      notify("Data berhasil disimpan.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function archive(row: Product | Customer) {
    try {
      await api("master", {
        kind,
        data: { ...row, archived: !row.archived },
        record_id: row.id,
        expected_version: row.version,
      });
      list.refresh();
      notify(row.archived ? "Data diaktifkan kembali." : "Data diarsipkan.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const current = edit && edit !== "new" ? edit : null;
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {product ? <Package size={18} /> : <Users size={18} />}{" "}
          {list.data?.count || 0} {product ? "produk" : "pelanggan"} terdaftar
        </p>
        {allowed && (
          <Button onClick={() => setEdit("new")}>
            <Plus size={16} />
            Tambah {product ? "produk" : "pelanggan"}
          </Button>
        )}
      </div>
      {edit && (
        <Card className="mb-6 p-6">
          <h2 className="mb-5 font-semibold">
            {current ? "Edit" : "Tambah"} {product ? "produk" : "pelanggan"}
          </h2>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label={product ? "Nama produk" : "Nama pelanggan"}
                id="name"
              >
                <Input
                  id="name"
                  name="name"
                  defaultValue={current?.name}
                  maxLength={200}
                  required
                  key={`${current?.id}-name`}
                />
              </Field>
              {product ? (
                <>
                  <Field label="SKU" id="sku">
                    <Input
                      id="sku"
                      name="sku"
                      defaultValue={(current as Product)?.sku}
                      maxLength={100}
                      required
                      key={`${current?.id}-sku`}
                    />
                  </Field>
                  <Field label="Kategori" id="category">
                    <Input
                      id="category"
                      name="category"
                      defaultValue={(current as Product)?.category}
                      key={`${current?.id}-category`}
                    />
                  </Field>
                <Field label="Merek" id="brand">
                    <Input id="brand" name="brand" defaultValue={(current as Product)?.brand} maxLength={100} />
                </Field>
                  <Field label="Varian / spesifikasi" id="variant">
                    <Input id="variant" name="variant" defaultValue={(current as Product)?.variant} maxLength={200} />
                  </Field>
                  <Field label="Satuan" id="unit">
                    <Input
                      id="unit"
                      name="unit"
                      defaultValue={(current as Product)?.unit || "pcs"}
                      required
                      key={`${current?.id}-unit`}
                    />
                  </Field>
                  <Field label="Modal aktual per unit (Rp)" id="purchase_price">
                    <Input
                      id="purchase_price"
                      name="purchase_price"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={(current as Product)?.purchase_price ?? ""}
                      key={`${current?.id}-price`}
                      placeholder="Isi modal aktual sebelum dihitung"
                    />
                  </Field>
                  <Field label="Harga daftar GMI per unit (Rp)" id="list_price">
                    <Input id="list_price" name="list_price" type="number" min="0" step="0.01" defaultValue={(current as Product)?.list_price ?? ""} placeholder="Referensi harga jual" key={`${current?.id}-list-price`} />
                  </Field>
                  <Field label="Jumlah isi per kemasan (opsional)" id="pack_quantity">
                    <Input id="pack_quantity" name="pack_quantity" type="number" min="1" step="1" defaultValue={(current as Product)?.pack_quantity ?? ""} placeholder="Contoh: 25 tes per box" key={`${current?.id}-pack`} />
                  </Field>
                  <Field label="Tanggal sumber harga" id="list_price_as_of">
                    <Input id="list_price_as_of" name="list_price_as_of" type="date" defaultValue={(current as Product)?.list_price_as_of ?? ""} key={`${current?.id}-list-date`} />
                  </Field>
                  <Field label="Sumber harga referensi" id="list_price_source">
                    <Input id="list_price_source" name="list_price_source" defaultValue={(current as Product)?.list_price_source ?? ""} placeholder="Daftar harga GMI 2026" key={`${current?.id}-list-source`} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="list_price_tax_included" defaultChecked={(current as Product)?.list_price_tax_included ?? false} />Harga daftar sudah termasuk PPN</label>
                </>
              ) : (
                <>
                  <Field label="Email" id="email">
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      defaultValue={(current as Customer)?.email}
                      key={`${current?.id}-email`}
                    />
                  </Field>
                  <Field label="Nomor telepon" id="phone">
                    <Input
                      id="phone"
                      name="phone"
                      defaultValue={(current as Customer)?.phone}
                      key={`${current?.id}-phone`}
                    />
                  </Field>
                  <Field label="Alamat penagihan" id="address">
                    <textarea
                      id="address"
                      name="address"
                      defaultValue={(current as Customer)?.address}
                      rows={3}
                      maxLength={1000}
                      key={`${current?.id}-address`}
                    />
                  </Field>
                </>
              )}
            </div>
            <input
              name="archived"
              type="hidden"
              value={String(current?.archived || false)}
            />
            <div className="flex gap-2">
              <Button disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan data"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEdit(null)}
              >
                Kembali
              </Button>
            </div>
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
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>{product ? "Produk / SKU" : "Pelanggan"}</th>
                  <th>{product ? "Kategori / satuan" : "Kontak"}</th>
                  <th>{product ? "Modal & harga daftar" : "Alamat penagihan"}</th>
                  <th>Status</th>
                  {allowed && <th>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {list.data?.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <p className="font-semibold">{row.name}</p>
                      {product && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {(row as Product).sku}
                        </p>
                      )}
                    </td>
                    <td>
                      {product ? (
                        <>
                          <p>{[(row as Product).brand, (row as Product).variant].filter(Boolean).join(" · ") || (row as Product).category || "—"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{(row as Product).category || "—"} / {(row as Product).unit}{(row as Product).pack_quantity ? ` · isi ${(row as Product).pack_quantity}` : ""}</p>
                        </>
                      ) : (
                        <>
                          <p>{(row as Customer).email || "—"}</p>
                          <p className="mt-1 text-muted-foreground">
                            {(row as Customer).phone}
                          </p>
                        </>
                      )}
                    </td>
                    <td>
                      {product ? (
                        <div className="whitespace-nowrap text-xs">
                          <p>{(row as Product).category.toLowerCase().includes("estimasi modal") ? "Modal estimasi: " : (row as Product).category.toLowerCase().includes("supplier siny 2024") ? "Harga supplier 2024: " : "Modal: "}{(row as Product).purchase_price === null ? <span className="text-amber-700">belum diisi</span> : rupiah((row as Product).purchase_price ?? 0)}</p>
                          <p className="mt-1">Daftar: {(row as Product).list_price == null ? "—" : rupiah((row as Product).list_price ?? 0)}{(row as Product).list_price_tax_included && <span className="text-muted-foreground"> · PPN incl.</span>}</p>
                          {(row as Product).list_price_source && <p className="text-xs text-muted-foreground">{(row as Product).list_price_source} · {(row as Product).list_price_as_of || "tanpa tanggal"}</p>}
                        </div>
                      ) : (
                        <span className="line-clamp-2 max-w-xs">
                          {(row as Customer).address || "—"}
                        </span>
                      )}
                    </td>
                    <td>
                      <Badge tone={row.archived ? "gray" : "green"}>
                        {row.archived ? "Diarsipkan" : "Aktif"}
                      </Badge>
                    </td>
                    {allowed && (
                      <td>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${row.name}`}
                            onClick={() => setEdit(row)}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={
                              row.archived ? "Aktifkan kembali" : "Arsipkan"
                            }
                            onClick={() => archive(row)}
                          >
                            <Archive size={16} />
                          </Button>
                        </div>
                      </td>
                    )}
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
