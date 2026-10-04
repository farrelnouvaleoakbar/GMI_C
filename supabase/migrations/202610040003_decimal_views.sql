begin;
-- PostgREST serializes numeric as JSON numbers. Expose money as strings so
-- JavaScript never truncates large monetary values before Decimal.js receives them.
create view public.api_products with (security_invoker=true) as select id,sku,name,category,unit,purchase_price::text,archived,version,created_at from public.products;
create view public.api_invoices with (security_invoker=true) as select id,draft_id,owner_id,number,snapshot,total::text,paid::text,revision_of,issued_at,cancelled_at,cancellation_reason,version from public.invoices;
create view public.api_payments with (security_invoker=true) as select id,invoice_id,actor_id,request_id,amount::text,paid_on,method,reference,created_at,cancelled_at,cancellation_reason,version from public.payments;
create view public.api_settings with (security_invoker=true) as select id,company_name,address,contact,logo_path,tax_percent::text,profit_percent::text,marketing_percent::text,operational_percent::text,invoice_prefix,next_invoice,version from public.settings;
revoke all on public.api_products,public.api_invoices,public.api_payments,public.api_settings from anon,authenticated;
grant select on public.api_products,public.api_invoices,public.api_payments,public.api_settings to authenticated;
alter table public.products add constraint purchase_price_limit check(purchase_price<=1000000000000);
alter table public.settings add constraint company_name_present check(length(trim(company_name)) between 1 and 200);
alter table public.products add constraint sku_present check(length(trim(sku)) between 1 and 100), add constraint product_name_present check(length(trim(name)) between 1 and 200),add constraint unit_present check(length(trim(unit)) between 1 and 50);
alter table public.customers add constraint customer_name_present check(length(trim(name)) between 1 and 200);
commit;
