import Decimal from "decimal.js";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const money = (n: Decimal.Value) =>
  new Decimal(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export function percentage(value: Decimal.Value, max = 100) {
  const n = new Decimal(value);
  if (!n.isFinite() || n.lt(0) || n.gt(max))
    throw new Error("Persentase tidak valid.");
  return n.div(100);
}
export function upward(value: Decimal.Value, step: Decimal.Value) {
  const s = new Decimal(step);
  if (![0, 100, 500, 1000].some((n) => s.eq(n)))
    throw new Error("Pembulatan tidak valid.");
  return s.isZero()
    ? money(value)
    : money(new Decimal(value).div(s).ceil().mul(s));
}
export function calculateLine(
  cost: Decimal.Value,
  shippingPerUnit: Decimal.Value,
  quantity: Decimal.Value,
  profitPercent: Decimal.Value,
  marketingPercent: Decimal.Value,
  operationalPercent: Decimal.Value,
  rounding: Decimal.Value = 0,
  override: Decimal.Value | null = null,
) {
  const b = new Decimal(cost),
    s = new Decimal(shippingPerUnit),
    q = new Decimal(quantity);
  if (
    ![b, s, q].every((n) => n.isFinite()) ||
    b.lt(0) ||
    s.lt(0) ||
    q.lte(0) ||
    !q.isInteger() ||
    q.gt(1000000)
  )
    throw new Error("Modal, ongkir, atau jumlah tidak valid.");
  const p = percentage(profitPercent, 1000),
    m = percentage(marketingPercent),
    o = percentage(operationalPercent);
  const denominator = new Decimal(1).minus(m).minus(o.mul(p.plus(1)));
  if (denominator.lte(0))
    throw new Error(
      "Harga tidak dapat dihitung: 1 − m − o × (1 + p) harus lebih besar dari nol. Kurangi persentase pemasaran atau operasional.",
    );
  const recommended = money(b.mul(p.plus(1)).plus(p.mul(s)).div(denominator));
  const selected =
    override === null ? upward(recommended, rounding) : new Decimal(override);
  if (
    !selected.isFinite() ||
    selected.lt(0) ||
    !selected.eq(money(selected)) ||
    selected.gt("1000000000000")
  )
    throw new Error("Harga jual tidak valid.");
  const total = money(selected.mul(q)),
    purchase = money(b.mul(q)),
    operational = money(total.mul(o)),
    marketing = money(total.mul(m));
  return {
    recommended: recommended.toFixed(2),
    selected: selected.toFixed(2),
    total: total.toFixed(2),
    purchase: purchase.toFixed(2),
    operational: operational.toFixed(2),
    marketing: marketing.toFixed(2),
    profit: total
      .minus(purchase)
      .minus(operational)
      .minus(marketing)
      .toFixed(2),
  };
}
export function summarize(
  lines: ReturnType<typeof calculateLine>[],
  shipping: Decimal.Value,
  taxPercent: Decimal.Value,
) {
  const sum = (key: keyof ReturnType<typeof calculateLine>) =>
    lines.reduce((acc, l) => acc.plus(l[key]), new Decimal(0));
  const subtotal = sum("total"),
    s = money(shipping);
  if (s.lt(0)) throw new Error("Ongkir tidak valid.");
  const tax = money(subtotal.plus(s).mul(percentage(taxPercent)));
  return {
    subtotal: subtotal.toFixed(2),
    shipping: s.toFixed(2),
    tax: tax.toFixed(2),
    total: subtotal.plus(s).plus(tax).toFixed(2),
    profit: sum("profit").toFixed(2),
  };
}

export type TaxOptions = {
  enabled: boolean;
  name: string;
  rate: Decimal.Value;
  mode: "added" | "included";
  base: "products" | "products_shipping";
};

export type TransactionLineInput = {
  cost: Decimal.Value;
  quantity: Decimal.Value;
  manual: Decimal.Value | null;
  rounding: Decimal.Value;
};

/** Order-level recommendation: allocate required revenue by purchase-cost share. */
export function recommendTransactionPrices(args: {
  lines: TransactionLineInput[];
  shipping: Decimal.Value | null;
  targetPercent: Decimal.Value;
  marketingPercent: Decimal.Value;
  operations: { name: string; percent: Decimal.Value }[];
  tax: TaxOptions;
}) {
  if (!args.lines.length) throw new Error("Tambahkan minimal satu produk.");
  const D = (v: Decimal.Value) => new Decimal(v);
  const lines = args.lines.map((l) => {
    const cost = D(l.cost), qty = D(l.quantity), step = D(l.rounding);
    if (cost.lte(0) || !cost.isFinite()) throw new Error("Harga beli produk belum valid.");
    if (qty.lte(0) || !qty.isInteger() || qty.gt(1000000)) throw new Error("Jumlah produk harus bilangan bulat positif, maksimal 1.000.000.");
    if (![0, 100, 500, 1000].some((n) => step.eq(n))) throw new Error("Pembulatan tidak valid.");
    return { ...l, cost, qty, lineCost: money(cost.mul(qty)), step };
  });
  const B = lines.reduce((a, l) => a.plus(l.lineCost), D(0));
  const S = money(args.shipping ?? 0);
  const p = percentage(args.targetPercent, 1000), m = percentage(args.marketingPercent);
  const ops = args.operations.map((x) => ({ ...x, rate: percentage(x.percent) }));
  const o = ops.reduce((a, x) => a.plus(x.rate), D(0));
  const denominator = D(1).minus(m).minus(o.mul(p.plus(1)));
  if (denominator.lte(0)) throw new Error("Target tidak dapat dicapai. Kurangi persentase biaya atau target.");
  const included = args.tax.enabled && args.tax.mode === "included";
  const taxRate = args.tax.enabled ? percentage(args.tax.rate) : D(0);
  if (args.tax.enabled && !args.tax.name.trim()) throw new Error("Isi nama pajak.");
  const shippingTax = included && args.tax.base === "products_shipping"
    ? money(S.minus(S.div(taxRate.plus(1))) ) : D(0);
  const minimumProductRevenue = B.mul(p.plus(1)).plus(p.mul(S)).plus(shippingTax).div(denominator);
  const recommended = lines.map((l) => {
    const unit = minimumProductRevenue.mul(l.lineCost).div(B).div(l.qty).mul(included ? taxRate.plus(1) : 1);
    return l.step.isZero() ? money(unit) : money(unit.div(l.step).ceil().mul(l.step));
  });
  const summarize = (prices: Decimal[]) => {
    const totals = prices.map((v, i) => money(v.mul(lines[i].qty)));
    const subtotal = totals.reduce((a, x) => a.plus(x), D(0));
    const productTax = args.tax.enabled ? money(included ? subtotal.minus(subtotal.div(taxRate.plus(1))) : subtotal.mul(taxRate)) : D(0);
    const revenue = included ? subtotal.minus(productTax) : subtotal;
    const opAmounts = ops.map((x) => ({ name: x.name, percent: D(x.percent).toString(), amount: money(revenue.mul(x.rate)).toFixed(2) }));
    const operational = opAmounts.reduce((a, x) => a.plus(x.amount), D(0));
    const marketing = money(revenue.mul(m));
    const C = B.plus(S).plus(operational);
    const targetProfit = money(C.mul(p));
    const profit = revenue.minus(B).minus(operational).minus(marketing).minus(included ? shippingTax : 0);
    const taxShipping = args.tax.enabled && args.tax.base === "products_shipping" ? money(included ? S.minus(S.div(taxRate.plus(1))) : S.mul(taxRate)) : D(0);
    const total = included ? subtotal.plus(S) : subtotal.plus(S).plus(productTax).plus(taxShipping);
    return { totals, subtotal, revenue, productTax, taxShipping, operational, marketing, C, targetProfit, profit, total, opAmounts };
  };
  for (let k = 0; k < 100; k++) {
    const check = summarize(recommended);
    if (check.profit.gte(check.targetProfit)) break;
    if (lines[0].step.isZero() || k === 99) throw new Error("Persentase terlalu dekat batas rumus. Kurangi biaya atau target.");
    recommended[0] = recommended[0].plus(lines[0].step);
  }
  if (summarize(recommended).profit.lt(summarize(recommended).targetProfit))
    throw new Error("Persentase terlalu dekat batas rumus. Kurangi biaya atau target.");
  const actual = lines.map((l, i) => l.manual === null ? recommended[i] : money(l.manual));
  const s = summarize(actual), gap = s.profit.minus(s.targetProfit);
  return {
    lines: lines.map((l, i) => ({ cost: l.lineCost.toFixed(2), recommended: recommended[i].toFixed(2), actual: actual[i].toFixed(2), total: s.totals[i].toFixed(2) })),
    minimumProductRevenue: minimumProductRevenue.toFixed(8), purchase: B.toFixed(2), shipping: S.toFixed(2), provisional: args.shipping === null,
    displayedSubtotal: s.subtotal.toFixed(2), productRevenue: s.revenue.toFixed(2), operations: s.opAmounts,
    operational: s.operational.toFixed(2), marketing: s.marketing.toFixed(2), costBase: s.C.toFixed(2), totalCost: s.C.plus(s.marketing).toFixed(2),
    targetProfit: s.targetProfit.toFixed(2), profit: money(s.profit).toFixed(2), profitPercent: s.C.isZero() ? "0" : s.profit.div(s.C).mul(100).toFixed(3), gap: money(gap).toFixed(2),
    taxProduct: s.productTax.toFixed(2), taxShipping: s.taxShipping.toFixed(2), tax: s.productTax.plus(s.taxShipping).toFixed(2), total: money(s.total).toFixed(2),
    status: s.profit.lt(0) ? "loss" : s.profit.eq(0) ? "even" : gap.gte(0) ? "target" : "below",
  };
}

/** Tax-aware order summary used for review and for parity tests against PostgreSQL. */
export function summarizeTransaction(args: {
  purchase: Decimal.Value;
  shipping: Decimal.Value | null;
  productSubtotal: Decimal.Value;
  marketingPercent: Decimal.Value;
  operations: { name: string; percent: Decimal.Value }[];
  targetPercent: Decimal.Value;
  tax: TaxOptions;
}) {
  const D = (v: Decimal.Value) => new Decimal(v);
  const S = money(args.shipping ?? 0);
  const subtotal = money(args.productSubtotal);
  const rate = args.tax.enabled ? percentage(args.tax.rate) : D(0);
  if (args.tax.enabled && !args.tax.name.trim()) throw new Error("Isi nama pajak.");
  const included = args.tax.enabled && args.tax.mode === "included";
  const taxProduct = args.tax.enabled
    ? money(included ? subtotal.minus(subtotal.div(rate.plus(1))) : subtotal.mul(rate))
    : D(0);
  const taxShipping = args.tax.enabled && args.tax.base === "products_shipping"
    ? money(included ? S.minus(S.div(rate.plus(1))) : S.mul(rate))
    : D(0);
  const revenue = included ? subtotal.minus(taxProduct) : subtotal;
  const operations = args.operations.map((item) => ({
    name: item.name,
    percent: D(item.percent).toString(),
    amount: money(revenue.mul(percentage(item.percent))).toFixed(2),
  }));
  const operational = operations.reduce((sum, item) => sum.plus(item.amount), D(0));
  const marketing = money(revenue.mul(percentage(args.marketingPercent)));
  const B = money(args.purchase);
  const C = B.plus(S).plus(operational);
  const targetProfit = money(C.mul(percentage(args.targetPercent, 1000)));
  const profit = revenue.minus(B).minus(operational).minus(marketing).minus(included ? taxShipping : 0);
  const total = included
    ? subtotal.plus(S)
    : subtotal.plus(S).plus(taxProduct).plus(taxShipping);
  const base = args.tax.base === "products_shipping"
    ? revenue.plus(included ? S.minus(taxShipping) : S)
    : revenue;
  const gap = profit.minus(targetProfit);
  const status = profit.lt(0) ? "loss" : profit.eq(0) ? "even" : gap.gte(0) ? "target" : "below";
  return {
    purchase: B.toFixed(2), shipping: S.toFixed(2), displayedSubtotal: subtotal.toFixed(2),
    productRevenue: revenue.toFixed(2), operations, operational: operational.toFixed(2),
    marketing: marketing.toFixed(2), costBase: C.toFixed(2), totalCost: C.plus(marketing).toFixed(2),
    targetProfit: targetProfit.toFixed(2), profit: money(profit).toFixed(2),
    profitPercent: C.isZero() ? "0" : profit.div(C).mul(100).toFixed(3),
    gap: money(gap).toFixed(2), status, taxProduct: taxProduct.toFixed(2),
    taxShipping: taxShipping.toFixed(2), tax: taxProduct.plus(taxShipping).toFixed(2),
    taxBase: money(base).toFixed(2), total: money(total).toFixed(2),
    provisional: args.shipping === null,
  };
}
