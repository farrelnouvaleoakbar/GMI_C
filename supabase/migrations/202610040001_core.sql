begin;
create schema if not exists private;
create type public.staff_role as enum ('admin','sales','finance');
create table public.profiles (id uuid primary key references auth.users(id), name text not null, role public.staff_role not null default 'sales', active boolean not null default false, version integer not null default 1, created_at timestamptz not null default now());
create table public.settings (id boolean primary key default true check(id), company_name text not null default 'Perusahaan Anda', address text not null default '', contact text not null default '', logo_path text, tax_percent numeric not null default 0 check(tax_percent between 0 and 100), profit_percent numeric not null default 20 check(profit_percent between 0 and 1000), marketing_percent numeric not null default 5 check(marketing_percent between 0 and 100), operational_percent numeric not null default 10 check(operational_percent between 0 and 100), invoice_prefix text not null default 'INV' check(invoice_prefix ~ '^[A-Z0-9-]{1,16}$'), next_invoice bigint not null default 1 check(next_invoice > 0), version integer not null default 1);
insert into public.settings(id) values(true);
create table public.operational_categories (id uuid primary key default gen_random_uuid(), name text not null, archived boolean not null default false, version integer not null default 1);
create table public.products (id uuid primary key default gen_random_uuid(), sku text not null unique, name text not null, category text not null default '', unit text not null default 'pcs', purchase_price numeric(18,2) not null check(purchase_price >= 0), archived boolean not null default false, version integer not null default 1, created_at timestamptz not null default now());
create table public.customers (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id), name text not null, email text not null default '', phone text not null default '', address text not null default '', archived boolean not null default false, version integer not null default 1, created_at timestamptz not null default now());
create table public.drafts (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id), customer_id uuid not null references public.customers(id), inputs jsonb not null, calculation jsonb not null, calculation_hash text not null, revision_of uuid, version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.invoices (id uuid primary key default gen_random_uuid(), draft_id uuid not null unique references public.drafts(id), owner_id uuid not null references public.profiles(id), number text not null unique, snapshot jsonb not null, total numeric(18,2) not null check(total >= 0), paid numeric(18,2) not null default 0 check(paid >= 0 and paid <= total), revision_of uuid references public.invoices(id), issued_at timestamptz not null default now(), cancelled_at timestamptz, cancellation_reason text, version integer not null default 1);
alter table public.drafts add constraint draft_revision_fk foreign key(revision_of) references public.invoices(id);
create table public.payments (id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id), actor_id uuid not null references public.profiles(id), request_id uuid not null unique, amount numeric(18,2) not null check(amount > 0), paid_on date not null, method text not null, reference text not null default '', created_at timestamptz not null default now(), cancelled_at timestamptz, cancellation_reason text, version integer not null default 1);
create table public.audit_log (id bigint generated always as identity primary key, actor_id uuid references public.profiles(id), action text not null, entity text not null, record_id text not null, details jsonb not null default '{}', created_at timestamptz not null default now());
create index customers_owner_idx on public.customers(owner_id);
create index drafts_owner_idx on public.drafts(owner_id);
create index invoices_owner_issued_idx on public.invoices(owner_id, issued_at desc);
create index payments_invoice_idx on public.payments(invoice_id);
create index audit_created_idx on public.audit_log(created_at desc);
create index products_search_idx on public.products using gin(to_tsvector('simple',name || ' ' || sku));
create index customers_search_idx on public.customers using gin(to_tsvector('simple',name || ' ' || email));

create function private.role() returns text language sql stable security definer set search_path = '' as $$ select role::text from public.profiles where id=auth.uid() and active $$;
create function private.require_role(roles text[]) returns void language plpgsql security definer set search_path = '' as $$ begin if not coalesce(private.role()=any(roles),false) then raise exception 'Akses ditolak. Akun harus aktif dan memiliki izin.' using errcode='42501'; end if; end $$;
create function private.can_own(owner uuid) returns boolean language sql stable security definer set search_path = '' as $$ select coalesce(private.role() in ('admin','finance') or (private.role()='sales' and owner=auth.uid()), false) $$;
create function private.audit(action text, entity text, record_id text, details jsonb default '{}') returns void language sql security definer set search_path = '' as $$ insert into public.audit_log(actor_id,action,entity,record_id,details) values(auth.uid(),action,entity,record_id,details) $$;
-- Auth users start inactive. Only bootstrap SQL or Admin can activate staff.
create function private.new_user() returns trigger language plpgsql security definer set search_path = '' as $$ begin insert into public.profiles(id,name) values(new.id,coalesce(new.raw_user_meta_data->>'name',new.email,'Staf')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_user();

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.operational_categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.drafts enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or private.role()='admin');
create policy settings_read on public.settings for select to authenticated using(private.role() is not null);
create policy categories_read on public.operational_categories for select to authenticated using(private.role() is not null);
create policy products_read on public.products for select to authenticated using(private.role() is not null);
create policy customers_read on public.customers for select to authenticated using(private.can_own(owner_id));
create policy drafts_read on public.drafts for select to authenticated using(private.role()='admin' or (private.role()='sales' and owner_id=auth.uid()));
create policy invoices_read on public.invoices for select to authenticated using(private.can_own(owner_id));
create policy payments_read on public.payments for select to authenticated using(exists(select 1 from public.invoices i where i.id=invoice_id and private.can_own(i.owner_id)));
create policy audit_read on public.audit_log for select to authenticated using(private.role()='admin');
-- No direct write grants: all mutations use checked transactional RPCs.
revoke all on public.profiles,public.settings,public.operational_categories,public.products,public.customers,public.drafts,public.invoices,public.payments,public.audit_log from anon,authenticated;
grant select on public.profiles,public.settings,public.operational_categories,public.products,public.customers,public.drafts,public.invoices,public.payments,public.audit_log to authenticated;
grant usage on schema private to authenticated;

create function public.save_master(kind text, data jsonb, record_id uuid default null, expected_version integer default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid:=coalesce(record_id,gen_random_uuid()); affected integer; old_owner uuid;
begin
 if kind='customers' then
  perform private.require_role(array['admin','sales']);
  if record_id is not null then select owner_id into old_owner from public.customers where id=record_id for update; if old_owner is null or (private.role()='sales' and old_owner<>auth.uid()) then raise exception 'Pelanggan tidak dapat diakses.' using errcode='42501'; end if; end if;
 else perform private.require_role(array['admin']); end if;
 if length(trim(coalesce(data->>'name',''))) = 0 then raise exception 'Nama wajib diisi.'; end if;
 if kind='products' then
  if record_id is null then insert into public.products(id,sku,name,category,unit,purchase_price) values(rid,data->>'sku',data->>'name',coalesce(data->>'category',''),coalesce(data->>'unit','pcs'),(data->>'purchase_price')::numeric);
  else update public.products set sku=data->>'sku',name=data->>'name',category=coalesce(data->>'category',''),unit=data->>'unit',purchase_price=(data->>'purchase_price')::numeric,archived=coalesce((data->>'archived')::boolean,false),version=version+1 where id=rid and version=expected_version; get diagnostics affected=row_count; end if;
 elsif kind='customers' then
  if record_id is null then insert into public.customers(id,owner_id,name,email,phone,address) values(rid,auth.uid(),data->>'name',coalesce(data->>'email',''),coalesce(data->>'phone',''),coalesce(data->>'address',''));
  else update public.customers set name=data->>'name',email=coalesce(data->>'email',''),phone=coalesce(data->>'phone',''),address=coalesce(data->>'address',''),archived=coalesce((data->>'archived')::boolean,false),version=version+1 where id=rid and version=expected_version; get diagnostics affected=row_count; end if;
 elsif kind='operational_categories' then
  if record_id is null then insert into public.operational_categories(id,name) values(rid,data->>'name'); else update public.operational_categories set name=data->>'name',archived=coalesce((data->>'archived')::boolean,false),version=version+1 where id=rid and version=expected_version; get diagnostics affected=row_count; end if;
 else raise exception 'Jenis data tidak valid.'; end if;
 if record_id is not null and affected<>1 then raise exception 'Data telah berubah. Muat ulang sebelum menyimpan.' using errcode='40001'; end if;
 perform private.audit('save',kind,rid::text,data); return rid;
end $$;

create function public.save_settings(data jsonb, expected_version integer) returns void language plpgsql security definer set search_path = '' as $$
begin perform private.require_role(array['admin']);
 if 1-(data->>'marketing_percent')::numeric/100-(data->>'operational_percent')::numeric/100*(1+(data->>'profit_percent')::numeric/100)<=0 then raise exception 'Default harga tidak valid: penyebut harus lebih besar dari nol.'; end if;
 update public.settings set company_name=data->>'company_name',address=data->>'address',contact=data->>'contact',logo_path=data->>'logo_path',tax_percent=(data->>'tax_percent')::numeric,profit_percent=(data->>'profit_percent')::numeric,marketing_percent=(data->>'marketing_percent')::numeric,operational_percent=(data->>'operational_percent')::numeric,invoice_prefix=data->>'invoice_prefix',version=version+1 where id and version=expected_version;
 if not found then raise exception 'Pengaturan telah berubah. Muat ulang.' using errcode='40001'; end if;
 perform private.audit('save','settings','true',data);
end $$;
create function public.update_staff(staff_id uuid, staff_name text, staff_role public.staff_role, staff_active boolean, expected_version integer) returns void language plpgsql security definer set search_path = '' as $$
begin perform private.require_role(array['admin']);
 -- Serialize role changes and never deactivate/demote the final active Admin.
 perform id from public.profiles where role='admin' order by id for update;
 if exists(select 1 from public.profiles where id=staff_id and role='admin' and active) and (staff_role<>'admin' or not staff_active) and (select count(*) from public.profiles where role='admin' and active)<=1 then raise exception 'Admin aktif terakhir tidak dapat dinonaktifkan.'; end if;
 update public.profiles set name=staff_name,role=staff_role,active=staff_active,version=version+1 where id=staff_id and version=expected_version;
 if not found then raise exception 'Profil telah berubah. Muat ulang.' using errcode='40001'; end if;
 perform private.audit('staff_update','profiles',staff_id::text,jsonb_build_object('role',staff_role,'active',staff_active));
end $$;

-- Exact PostgreSQL numeric arithmetic mirrors Decimal.js; no submitted totals are read.
create function private.calculate(inputs jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.customers; s public.settings; product public.products; item jsonb; lines jsonb:='[]'; shipping numeric; qty_sum numeric:=0; q numeric; b numeric; alloc numeric; p numeric; m numeric; o numeric; denominator numeric; idx integer:=0; recommended numeric; selected numeric; line_total numeric; subtotal numeric:=0; purchase numeric:=0; operational numeric:=0; marketing numeric:=0; tax numeric; total numeric; profit numeric; step numeric; notes text;
begin
 perform private.require_role(array['admin','sales']);
 select * into c from public.customers where id=(inputs->>'customer_id')::uuid;
 if c.id is null or c.archived or not private.can_own(c.owner_id) then raise exception 'Pelanggan tidak dapat diakses atau telah diarsipkan.' using errcode='42501'; end if;
 select * into s from public.settings where id;
 if inputs->>'due_date' is null then raise exception 'Tanggal jatuh tempo wajib diisi.'; end if;
 shipping:=coalesce((inputs->>'shipping')::numeric,0);
 if shipping<0 or shipping<>round(shipping,2) or shipping>1000000000000 then raise exception 'Ongkir harus berupa Rupiah positif dengan maksimal dua desimal.'; end if;
 if jsonb_typeof(inputs->'lines')<>'array' or jsonb_array_length(inputs->'lines') not between 1 and 100 then raise exception 'Tambahkan 1–100 baris produk.'; end if;
 for item in select value from jsonb_array_elements(inputs->'lines') loop
  q:=(item->>'quantity')::numeric; if q is null or q<=0 or q<>trunc(q) or q>1000000 then raise exception 'Jumlah harus bilangan bulat antara 1 dan 1.000.000.'; end if; qty_sum:=qty_sum+q;
 end loop;
 alloc:=shipping/qty_sum;
 for item in select value from jsonb_array_elements(inputs->'lines') loop
  select * into product from public.products where id=(item->>'product_id')::uuid;
  if product.id is null or product.archived then raise exception 'Produk tidak ditemukan atau telah diarsipkan.'; end if;
  idx:=idx+1; q:=(item->>'quantity')::numeric; b:=product.purchase_price;
  p:=coalesce((item->>'profit_percent')::numeric,s.profit_percent)/100; m:=coalesce((item->>'marketing_percent')::numeric,s.marketing_percent)/100; o:=coalesce((item->>'operational_percent')::numeric,s.operational_percent)/100;
  if p not between 0 and 10 or m not between 0 and 1 or o not between 0 and 1 then raise exception 'Persentase tidak valid.'; end if;
  denominator:=1-m-o*(1+p);
  if denominator<=0 then raise exception 'Harga tidak dapat dihitung: 1 − m − o × (1 + p) harus lebih besar dari nol. Kurangi persentase pemasaran atau operasional.'; end if;
  recommended:=round((b*(1+p)*qty_sum+p*shipping)/(denominator*qty_sum),2);
  step:=coalesce((item->>'rounding')::numeric,0); if step not in (0,100,500,1000) then raise exception 'Pembulatan tidak valid.'; end if;
  selected:=coalesce((item->>'selected_price')::numeric,case when step=0 then recommended else ceil(recommended/step)*step end);
  if selected<0 or selected<>round(selected,2) or selected>1000000000000 then raise exception 'Harga jual tidak valid.'; end if;
  line_total:=round(selected*q,2); subtotal:=subtotal+line_total; purchase:=purchase+b*q;
  operational:=operational+round(selected*q*o,2); marketing:=marketing+round(selected*q*m,2);
  lines:=lines||jsonb_build_array(jsonb_build_object('line_id',idx::text,'product_id',product.id,'product_version',product.version,'sku',product.sku,'name',product.name,'unit',product.unit,'quantity',q::text,'purchase_price',b::text,'shipping_per_unit',alloc::text,'profit_percent',(p*100)::text,'marketing_percent',(m*100)::text,'operational_percent',(o*100)::text,'recommended_price',recommended::text,'selected_price',selected::text,'line_total',line_total::text,'operational_cost',round(selected*q*o,2)::text,'marketing_cost',round(selected*q*m,2)::text,'profit',(line_total-b*q-round(selected*q*m,2)-round(selected*q*o,2))::text));
 end loop;
 tax:=round((subtotal+shipping)*s.tax_percent/100,2); total:=subtotal+shipping+tax; profit:=subtotal-purchase-operational-marketing;
 notes:=coalesce(inputs->>'notes',''); if length(notes)>2000 then raise exception 'Catatan terlalu panjang.'; end if;
 return jsonb_build_object('company',to_jsonb(s)-'next_invoice'-'version','customer',to_jsonb(c)-'created_at'-'version'-'archived','lines',lines,'shipping',shipping::text,'subtotal',subtotal::text,'purchase',purchase::text,'operational',operational::text,'marketing',marketing::text,'tax_percent',s.tax_percent::text,'tax',tax::text,'total',total::text,'profit',profit::text,'notes',notes,'due_date',(inputs->>'due_date')::date,'shipping_rule','Ongkir dibagi sama per unit, ditagihkan sekali sebagai biaya terpisah.');
end $$;
create function private.calc_hash(calculation jsonb, ver integer default 0) returns text language sql immutable set search_path = '' as $$ select encode(pg_catalog.sha256(convert_to(calculation::text||':'||ver::text,'UTF8')),'hex') $$;
create function public.preview_draft(inputs jsonb, draft_id uuid default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c jsonb; v integer:=0; d public.drafts;
begin
 if draft_id is not null then select * into d from public.drafts where id=draft_id; if d.id is null or not private.can_own(d.owner_id) then raise exception 'Draf tidak dapat diakses.' using errcode='42501'; end if; v:=d.version; end if;
 c:=private.calculate(inputs); return jsonb_build_object('calculation',c,'hash',private.calc_hash(c,v),'version',v);
end $$;
create function public.save_draft(inputs jsonb, draft_id uuid default null, expected_version integer default null, loss_confirmation text default null, revision_of uuid default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.drafts; c jsonb; h text; rid uuid:=coalesce(draft_id,gen_random_uuid()); v integer:=0;
begin
 perform private.require_role(array['admin','sales']);
 if draft_id is not null then
  select * into d from public.drafts where id=draft_id for update;
  if d.id is null or not private.can_own(d.owner_id) then raise exception 'Draf tidak dapat diakses.' using errcode='42501'; end if;
  if exists(select 1 from public.invoices where invoices.draft_id=d.id) then raise exception 'Invoice sudah diterbitkan. Buat revisi baru.'; end if;
  if d.version<>expected_version then raise exception 'Draf telah berubah. Muat ulang.' using errcode='40001'; end if; v:=d.version;
 end if;
 if revision_of is not null and not exists(select 1 from public.invoices where id=save_draft.revision_of and private.can_own(owner_id)) then raise exception 'Invoice asal tidak dapat diakses.' using errcode='42501'; end if;
 c:=private.calculate(inputs); h:=private.calc_hash(c,v);
 if (c->>'profit')::numeric<0 and loss_confirmation is distinct from h then raise exception 'Transaksi rugi. Tinjau dan konfirmasi perhitungan terbaru sebelum menyimpan.'; end if;
 if draft_id is null then insert into public.drafts(id,owner_id,customer_id,inputs,calculation,calculation_hash,revision_of) values(rid,auth.uid(),(inputs->>'customer_id')::uuid,inputs,c,private.calc_hash(c,1),revision_of);
 else update public.drafts set customer_id=(save_draft.inputs->>'customer_id')::uuid,inputs=save_draft.inputs,calculation=c,version=version+1,calculation_hash=private.calc_hash(c,v+1),updated_at=now() where id=rid; end if;
 perform private.audit('save','drafts',rid::text,jsonb_build_object('version',v+1,'confirmed_loss',(c->>'profit')::numeric<0)); return rid;
end $$;
create function public.delete_draft(draft_id uuid, expected_version integer) returns void language plpgsql security definer set search_path = '' as $$
declare d public.drafts;
begin perform private.require_role(array['admin','sales']); select * into d from public.drafts where id=draft_id for update;
 if d.id is null or not private.can_own(d.owner_id) then raise exception 'Draf tidak dapat diakses.' using errcode='42501'; end if;
 if d.version<>expected_version then raise exception 'Draf telah berubah.' using errcode='40001'; end if;
 if exists(select 1 from public.invoices where invoices.draft_id=d.id) then raise exception 'Draf invoice terbit tidak dapat dihapus.'; end if;
 delete from public.drafts where id=d.id; perform private.audit('delete','drafts',draft_id::text);
end $$;
create function public.issue_invoice(draft_id uuid, expected_version integer, reviewed_hash text, loss_confirmation text default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.drafts; c jsonb; h text; result uuid; cfg public.settings; invoice_number text;
begin
 perform private.require_role(array['admin','sales']);
 select * into d from public.drafts where id=draft_id for update;
 if d.id is null or not private.can_own(d.owner_id) then raise exception 'Draf tidak dapat diakses.' using errcode='42501'; end if;
 select id into result from public.invoices where invoices.draft_id=d.id; if result is not null then return result; end if;
 if d.version<>expected_version then raise exception 'Draf telah berubah. Muat ulang.' using errcode='40001'; end if;
 -- Lock catalog, customer and settings through issuance; concurrent catalog edits cannot race review.
 perform id from public.products where id in(select (value->>'product_id')::uuid from jsonb_array_elements(d.inputs->'lines')) order by id for share;
 perform id from public.customers where id=d.customer_id for share;
 select * into cfg from public.settings where id for update;
 c:=private.calculate(d.inputs); h:=private.calc_hash(c,d.version);
 if h is distinct from reviewed_hash or h is distinct from d.calculation_hash then raise exception 'Harga, pelanggan, atau pengaturan berubah. Hitung ulang dan simpan draf sebelum menerbitkan.' using errcode='40001'; end if;
 if (c->>'profit')::numeric<0 and loss_confirmation is distinct from h then raise exception 'Konfirmasi kerugian untuk versi draf ini diperlukan.'; end if;
 invoice_number:=cfg.invoice_prefix||'/'||to_char(now(),'YYYY')||'/'||lpad(cfg.next_invoice::text,6,'0');
 update public.settings set next_invoice=next_invoice+1 where id;
 insert into public.invoices(draft_id,owner_id,number,snapshot,total,revision_of) values(d.id,d.owner_id,invoice_number,c,(c->>'total')::numeric,d.revision_of) returning id into result;
 perform private.audit('issue','invoices',result::text,jsonb_build_object('number',invoice_number,'draft',d.id,'confirmed_loss',(c->>'profit')::numeric<0)); return result;
end $$;
create function public.record_payment(invoice_id uuid, request_id uuid, amount numeric, paid_on date, method text, reference text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.invoices; prior public.payments; result uuid;
begin
 perform private.require_role(array['admin','finance']);
 -- Global idempotency key lock, then invoice row lock; prevents same-key concurrent requests.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
 select * into prior from public.payments where payments.request_id=record_payment.request_id;
 if prior.id is not null then
  if prior.invoice_id is distinct from invoice_id or prior.amount is distinct from amount or prior.paid_on is distinct from paid_on or prior.method is distinct from method or prior.reference is distinct from reference then raise exception 'Kunci pembayaran telah digunakan untuk data berbeda.'; end if;
  return prior.id;
 end if;
 select * into i from public.invoices where id=invoice_id for update;
 if i.id is null or i.cancelled_at is not null then raise exception 'Invoice tidak ditemukan atau dibatalkan.'; end if;
 if amount is null or amount<=0 or amount<>round(amount,2) or amount>i.total-i.paid then raise exception 'Pembayaran harus positif dan tidak boleh melebihi sisa tagihan.'; end if;
 if paid_on is null or paid_on>(now() at time zone 'Asia/Jakarta')::date or length(trim(coalesce(method,'')))=0 then raise exception 'Tanggal atau metode pembayaran tidak valid.'; end if;
 insert into public.payments(invoice_id,actor_id,request_id,amount,paid_on,method,reference) values(i.id,auth.uid(),request_id,amount,paid_on,method,reference) returning id into result;
 update public.invoices set paid=paid+amount,version=version+1 where id=i.id;
 perform private.audit('record','payments',result::text,jsonb_build_object('invoice_id',i.id,'amount',amount)); return result;
end $$;
create function public.cancel_payment(payment_id uuid, expected_version integer, reason text) returns void language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
 perform private.require_role(array['admin','finance']); if length(trim(coalesce(reason,'')))<5 then raise exception 'Alasan minimal 5 karakter.'; end if;
 select * into p from public.payments where id=payment_id;
 if p.id is null then raise exception 'Pembayaran tidak ditemukan.'; end if;
 perform id from public.invoices where id=p.invoice_id for update;
 select * into p from public.payments where id=payment_id for update;
 if p.cancelled_at is not null then return; end if;
 if p.version<>expected_version then raise exception 'Pembayaran telah berubah.' using errcode='40001'; end if;
 update public.payments set cancelled_at=now(),cancellation_reason=reason,version=version+1 where id=p.id;
 update public.invoices set paid=paid-p.amount,version=version+1 where id=p.invoice_id;
 perform private.audit('cancel','payments',p.id::text,jsonb_build_object('reason',reason));
end $$;
create function public.cancel_invoice(invoice_id uuid, expected_version integer, reason text) returns void language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
 perform private.require_role(array['admin','sales']); if length(trim(coalesce(reason,'')))<5 then raise exception 'Alasan minimal 5 karakter.'; end if;
 select * into i from public.invoices where id=invoice_id for update;
 if i.id is null or not private.can_own(i.owner_id) then raise exception 'Invoice tidak dapat diakses.' using errcode='42501'; end if;
 if i.cancelled_at is not null then return; end if;
 if i.version<>expected_version then raise exception 'Invoice telah berubah.' using errcode='40001'; end if;
 if i.paid>0 then raise exception 'Batalkan pembayaran aktif sebelum membatalkan invoice.'; end if;
 update public.invoices set cancelled_at=now(),cancellation_reason=reason,version=version+1 where id=i.id;
 perform private.audit('cancel','invoices',i.id::text,jsonb_build_object('reason',reason));
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('invoice-pdfs','invoice-pdfs',false,10485760,array['application/pdf']),('company-assets','company-assets',false,2097152,array['image/png','image/jpeg']);
create policy invoice_pdf_read on storage.objects for select to authenticated using(bucket_id='invoice-pdfs' and exists(select 1 from public.invoices i where i.id::text=split_part(name,'/',1) and private.can_own(i.owner_id)));
create policy company_assets_read on storage.objects for select to authenticated using(bucket_id='company-assets' and private.role() is not null);
-- Uploads performed only by checked server endpoints; browser has no Storage write policies.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.role(), private.can_own(uuid) to authenticated;
revoke all on function public.save_master(text,jsonb,uuid,integer),public.save_settings(jsonb,integer),public.update_staff(uuid,text,public.staff_role,boolean,integer),public.preview_draft(jsonb,uuid),public.save_draft(jsonb,uuid,integer,text,uuid),public.delete_draft(uuid,integer),public.issue_invoice(uuid,integer,text,text),public.record_payment(uuid,uuid,numeric,date,text,text),public.cancel_payment(uuid,integer,text),public.cancel_invoice(uuid,integer,text) from public,anon;
grant execute on function public.save_master(text,jsonb,uuid,integer),public.save_settings(jsonb,integer),public.update_staff(uuid,text,public.staff_role,boolean,integer),public.preview_draft(jsonb,uuid),public.save_draft(jsonb,uuid,integer,text,uuid),public.delete_draft(uuid,integer),public.issue_invoice(uuid,integer,text,text),public.record_payment(uuid,uuid,numeric,date,text,text),public.cancel_payment(uuid,integer,text),public.cancel_invoice(uuid,integer,text) to authenticated;
commit;
