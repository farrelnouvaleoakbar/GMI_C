import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  percentage,
  calculateLine,
  money,
  upward,
  summarize,
  recommendTransactionPrices,
} from "../src/lib/pricing";
describe("Kalkulasi Rupiah", () => {
  it("mengonversi persentase tepat satu kali", () => {
    expect(percentage("20").toString()).toBe("0.2");
    expect(percentage("0.5").toString()).toBe("0.005");
    expect(() => percentage("-1")).toThrow();
  });
  it("menggunakan rumus yang diminta dengan modal dan ongkir per unit", () => {
    const l = calculateLine("100000", "10000", 2, 20, 5, 10);
    expect(l.recommended).toBe("146987.95");
    expect(l.total).toBe("293975.90");
    expect(l.profit).toBe("49879.51");
  });
  it.each([
    [20, 40, 50],
    [20, 50, 50],
  ])("menolak penyebut nol atau negatif (%s,%s,%s)", (p, m, o) => {
    expect(() => calculateLine(100, 0, 1, p, m, o)).toThrow(
      "harus lebih besar dari nol",
    );
  });
  it("HALF_UP dua desimal, termasuk nilai pecahan", () => {
    expect(money("1.005").toFixed(2)).toBe("1.01");
    expect(money("-1.005").toFixed(2)).toBe("-1.01");
  });
  it.each([
    [100, "147000.00"],
    [500, "147000.00"],
    [1000, "147000.00"],
  ])("pembulatan selalu ke atas dengan kelipatan %s", (step, value) => {
    expect(upward("146987.95", step).toFixed(2)).toBe(value);
    expect(upward("147000", step).toFixed(2)).toBe("147000.00");
  });
  it("pembulatan ratusan tidak turun", () => {
    expect(upward("100.01", 100).toFixed(2)).toBe("200.00");
  });
  it("ongkir dialokasikan per unit tetapi ditagihkan sekali; pajak bukan profit", () => {
    const shipping = new Decimal(10000),
      allocated = shipping.div(5);
    const lines = [
      calculateLine(10000, allocated, 2, 20, 5, 10),
      calculateLine(20000, allocated, 3, 20, 5, 10),
    ];
    const a = summarize(lines, shipping, 0),
      b = summarize(lines, shipping, 11);
    expect(a.shipping).toBe("10000.00");
    expect(b.profit).toBe(a.profit);
    expect(new Decimal(b.total).minus(a.total).toFixed(2)).toBe(b.tax);
  });
  it("override manual memperlihatkan kerugian", () => {
    expect(calculateLine(100000, 0, 1, 20, 5, 10, 0, "50000").profit).toBe(
      "-57500.00",
    );
  });
  it("mengalokasikan rekomendasi berdasarkan bagian modal dan merangkum kategori biaya", () => {
    const result = recommendTransactionPrices({
      lines: [
        { cost: "100000", quantity: "1", manual: null, rounding: "100" },
        { cost: "50000", quantity: "1", manual: null, rounding: "500" },
      ],
      shipping: "15000", targetPercent: "20", marketingPercent: "5",
      operations: [{ name: "Sewa", percent: "5" }, { name: "Gaji", percent: "3" }],
      tax: { enabled: false, name: "PPN", rate: "11", mode: "added", base: "products_shipping" },
    });
    expect(result.minimumProductRevenue).toBe("214285.71428571");
    expect(result.lines.map((l) => l.recommended)).toEqual(["142900.00", "71500.00"]);
    expect(result.status).toBe("target");
    expect(result.operations.map((x) => x.name)).toEqual(["Sewa", "Gaji"]);
  });
  it("membedakan ongkir belum diketahui dari ongkir nol", () => {
    const args = {
      lines: [{ cost: 100000, quantity: 1, manual: null, rounding: 100 }],
      targetPercent: 20, marketingPercent: 5, operations: [],
      tax: { enabled: false, name: "PPN", rate: 0, mode: "added" as const, base: "products" as const },
    };
    expect(recommendTransactionPrices({ ...args, shipping: null }).provisional).toBe(true);
    expect(recommendTransactionPrices({ ...args, shipping: "0" }).provisional).toBe(false);
  });
  it("pajak termasuk yang dikenakan ke ongkir menaikkan rekomendasi, bukan profit", () => {
    const result = recommendTransactionPrices({
      lines: [{ cost: "100000", quantity: "1", manual: null, rounding: "100" }],
      shipping: "11000", targetPercent: "20", marketingPercent: "5",
      operations: [{ name: "Operasional", percent: "10" }],
      tax: { enabled: true, name: "PPN", rate: "11", mode: "included", base: "products_shipping" },
    });
    expect(result.taxShipping).toBe("1090.09");
    expect(result.total).toBe("175900.00");
    expect(result.status).toBe("target");
  });
});
