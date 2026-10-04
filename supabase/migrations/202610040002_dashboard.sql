begin;
-- SHA-256 is built into PostgreSQL; independent of the extension installation schema.
create or replace function private.calc_hash(calculation jsonb, ver integer default 0) returns text language sql immutable set search_path = '' as $$ select encode(pg_catalog.sha256(convert_to(calculation::text||':'||ver::text,'UTF8')),'hex') $$;
create function public.dashboard_summary() returns jsonb language plpgsql security invoker set search_path = '' as $$
declare sales numeric; received numeric; outstanding numeric; n bigint; recent_i jsonb; recent_p jsonb; months jsonb;
begin
 if private.role() is null then raise exception 'Akses ditolak.' using errcode='42501'; end if;
 select coalesce(sum(total),0),coalesce(sum(paid),0),coalesce(sum(total-paid),0),count(*) into sales,received,outstanding,n from public.invoices where cancelled_at is null;
 select coalesce(jsonb_agg((to_jsonb(r)-'exact_total'-'exact_paid')||jsonb_build_object('total',r.exact_total,'paid',r.exact_paid)),'[]') into recent_i from (select i.*,i.total::text as exact_total,i.paid::text as exact_paid from public.invoices i order by issued_at desc limit 6) r;
 select coalesce(jsonb_agg((to_jsonb(r)-'exact_amount')||jsonb_build_object('amount',r.exact_amount)),'[]') into recent_p from (select p.*,p.amount::text as exact_amount from public.payments p order by created_at desc limit 5) r;
 select coalesce(jsonb_agg(jsonb_build_object('month',m,'total',t::text)),'[]') into months from (select to_char(issued_at at time zone 'Asia/Jakarta','YYYY-MM') m,sum(total) t from public.invoices where cancelled_at is null and issued_at>=((date_trunc('month',now() at time zone 'Asia/Jakarta')-interval '5 months') at time zone 'Asia/Jakarta') group by m order by m) r;
 return jsonb_build_object('sales',sales::text,'payments',received::text,'outstanding',outstanding::text,'invoice_count',n,'recent_invoices',recent_i,'recent_payments',recent_p,'months',months);
end $$;
revoke execute on function public.dashboard_summary() from public,anon;
grant execute on function public.dashboard_summary() to authenticated;
create function public.audit_staff_created(staff_id uuid) returns void language plpgsql security definer set search_path = '' as $$ begin perform private.require_role(array['admin']); if not exists(select 1 from public.profiles where id=staff_id) then raise exception 'Staf tidak ditemukan.'; end if;perform private.audit('create','profiles',staff_id::text);end $$;
revoke execute on function public.audit_staff_created(uuid) from public,anon;
grant execute on function public.audit_staff_created(uuid) to authenticated;
create view public.open_drafts with (security_invoker=true) as select d.* from public.drafts d where not exists(select 1 from public.invoices i where i.draft_id=d.id);
revoke all on public.open_drafts from anon,authenticated;
grant select on public.open_drafts to authenticated;
commit;
