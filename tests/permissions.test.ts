import { it, expect } from "vitest";
import { can } from "../src/lib/permissions";
import type { Profile } from "../src/lib/types";
const p = (role: Profile["role"], active = true): Profile => ({
  id: "sales-a",
  name: "Staf",
  role,
  active,
  version: 1,
});
it("Admin aktif dapat mengelola semua data", () => {
  for (const a of [
    "product",
    "customer",
    "draft",
    "invoice",
    "payment",
    "settings",
    "staff",
  ] as const)
    expect(can(p("admin"), a, "other")).toBe(true);
});
it("Sales hanya mengelola pelanggan dan transaksi miliknya", () => {
  expect(can(p("sales"), "customer", "sales-a")).toBe(true);
  expect(can(p("sales"), "draft", "other")).toBe(false);
  expect(can(p("sales"), "payment")).toBe(false);
  expect(can(p("sales"), "settings")).toBe(false);
});
it("Finance dapat melihat invoice dan mencatat pembayaran", () => {
  expect(can(p("finance"), "invoice", "other")).toBe(true);
  expect(can(p("finance"), "payment")).toBe(true);
  expect(can(p("finance"), "draft")).toBe(false);
  expect(can(p("finance"), "staff")).toBe(false);
});
it("akun nonaktif tidak mempunyai izin", () => {
  expect(can(p("admin", false), "settings")).toBe(false);
});
