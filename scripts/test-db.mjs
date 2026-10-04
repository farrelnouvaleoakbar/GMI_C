import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
// Optional multi-connection test against a migrated, disposable Supabase project.
if (
  !process.env.TEST_DATABASE_URL ||
  process.env.ACK_DISPOSABLE_DATABASE !== "yes"
) {
  console.error(
    "Set TEST_DATABASE_URL and ACK_DISPOSABLE_DATABASE=yes for a disposable migrated Supabase database.",
  );
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 5,
});
const admin = randomUUID(),
  sales = randomUUID(),
  finance = randomUUID(),
  product = randomUUID(),
  customer = randomUUID();
async function actor(id, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
async function rpc(c, name, args) {
  const r = await c.query(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`,
    args,
  );
  return r.rows[0].result;
}
try {
  for (const [id, role] of [
    [admin, "admin"],
    [sales, "sales"],
    [finance, "finance"],
  ]) {
    await pool.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')",
      [id, `concurrency-${id}@example.invalid`],
    );
    await pool.query(
      "update public.profiles set role=$2::public.staff_role,active=true where id=$1",
      [id, role],
    );
  }
  await pool.query(
    "insert into public.products(id,sku,name,purchase_price) values($1,$2,'Concurrency fixture',0)",
    [product, `TEST-${product}`],
  );
  await pool.query(
    "insert into public.customers(id,owner_id,name) values($1,$2,'Concurrency fixture')",
    [customer, sales],
  );
  const inputs = {
    customer_id: customer,
    shipping: "0",
    due_date: "2099-01-01",
    notes: "",
    lines: [
      {
        product_id: product,
        quantity: "1",
        profit_percent: "0",
        marketing_percent: "0",
        operational_percent: "0",
        rounding: "0",
        selected_price: "100",
      },
    ],
  };
  const draft = await actor(sales, (c) => rpc(c, "save_draft", [inputs]));
  const preview = await actor(sales, (c) =>
    rpc(c, "preview_draft", [inputs, draft]),
  );
  const [a, b] = await Promise.all([
    actor(sales, (c) => rpc(c, "issue_invoice", [draft, 1, preview.hash])),
    actor(sales, (c) => rpc(c, "issue_invoice", [draft, 1, preview.hash])),
  ]);
  assert.equal(a, b);
  const total = (
    await pool.query("select total from public.invoices where id=$1", [a])
  ).rows[0].total;
  // Tax may be configured; fractions are taken from the frozen grand total.
  const first = new Decimal(total).mul("0.5").toFixed(2),
    next = new Decimal(total).mul("0.4").toFixed(2);
  const key = randomUUID();
  const [p1, p2] = await Promise.all([
    actor(finance, (c) =>
      rpc(c, "record_payment", [a, key, first, "2020-01-01", "Test", "same"]),
    ),
    actor(finance, (c) =>
      rpc(c, "record_payment", [a, key, first, "2020-01-01", "Test", "same"]),
    ),
  ]);
  assert.equal(p1, p2);
  const race = await Promise.allSettled([
    actor(finance, (c) =>
      rpc(c, "record_payment", [
        a,
        randomUUID(),
        next,
        "2020-01-01",
        "Test",
        "A",
      ]),
    ),
    actor(finance, (c) =>
      rpc(c, "record_payment", [
        a,
        randomUUID(),
        next,
        "2020-01-01",
        "Test",
        "B",
      ]),
    ),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(race.filter((r) => r.status === "rejected").length, 1);
  const final = (
    await pool.query("select paid,total from public.invoices where id=$1", [a])
  ).rows[0];
  assert(new Decimal(final.paid).lte(final.total));
  console.log(
    "PASS: concurrent issuance, same-key payment retry, concurrent overpayment protection.",
  );
} finally {
  // Remove only the uniquely scoped fixture records. Invoice sequence is deliberately not reset.
  await pool.query(
    "delete from public.audit_log where actor_id=any($1::uuid[])",
    [[admin, sales, finance]],
  );
  await pool.query(
    "delete from public.payments where invoice_id in(select id from public.invoices where owner_id=$1)",
    [sales],
  );
  await pool.query("delete from public.invoices where owner_id=$1", [sales]);
  await pool.query("delete from public.drafts where owner_id=$1", [sales]);
  await pool.query("delete from public.customers where id=$1", [customer]);
  await pool.query("delete from public.products where id=$1", [product]);
  await pool.query("delete from public.profiles where id=any($1::uuid[])", [
    [admin, sales, finance],
  ]);
  await pool.query("delete from auth.users where id=any($1::uuid[])", [
    [admin, sales, finance],
  ]);
  await pool.end();
}
