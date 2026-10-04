begin;

-- GMI's source lists are customer-facing references, never confirmed modal.
alter table public.products alter column purchase_price drop not null;
alter table public.products add column brand text not null default '',
  add column variant text not null default '',
  add column list_price numeric(18,2) check (list_price is null or list_price between 0 and 1000000000000),
  add column list_price_tax_included boolean not null default false,
  add column list_price_as_of date,
  add column list_price_source text not null default '',
  add column pack_quantity integer check (pack_quantity is null or pack_quantity > 0);

create or replace view public.api_products with (security_invoker=true) as
select id,sku,name,category,unit,purchase_price::text,archived,version,created_at,
  brand,variant,list_price::text,list_price_tax_included,list_price_as_of,list_price_source,pack_quantity
from public.products;

create or replace function public.save_product(data jsonb, record_id uuid default null, expected_version integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rid uuid:=coalesce(record_id,gen_random_uuid());
  affected integer;
  cost numeric;
  listed numeric;
  package_count integer;
begin
  perform private.require_role(array['admin']);
  if length(trim(coalesce(data->>'sku','')))=0 or length(trim(coalesce(data->>'name','')))=0 then
    raise exception 'Kode dan nama produk wajib diisi.';
  end if;
  cost:=nullif(data->>'purchase_price','')::numeric;
  listed:=nullif(data->>'list_price','')::numeric;
  package_count:=nullif(data->>'pack_quantity','')::integer;
  if (cost is not null and (cost<0 or cost>1000000000000))
     or (listed is not null and (listed<0 or listed>1000000000000))
     or (package_count is not null and package_count<=0) then
    raise exception 'Harga atau jumlah kemasan tidak valid.';
  end if;
  if record_id is null then
    insert into public.products(id,sku,name,brand,variant,category,unit,purchase_price,list_price,list_price_tax_included,list_price_as_of,list_price_source,pack_quantity)
    values(rid,data->>'sku',data->>'name',coalesce(data->>'brand',''),coalesce(data->>'variant',''),coalesce(data->>'category',''),coalesce(data->>'unit','pcs'),cost,listed,coalesce((data->>'list_price_tax_included')::boolean,false),nullif(data->>'list_price_as_of','')::date,coalesce(data->>'list_price_source',''),package_count);
  else
    update public.products set sku=data->>'sku',name=data->>'name',brand=coalesce(data->>'brand',''),variant=coalesce(data->>'variant',''),category=coalesce(data->>'category',''),unit=coalesce(data->>'unit','pcs'),purchase_price=cost,list_price=listed,list_price_tax_included=coalesce((data->>'list_price_tax_included')::boolean,false),list_price_as_of=nullif(data->>'list_price_as_of','')::date,list_price_source=coalesce(data->>'list_price_source',''),pack_quantity=package_count,archived=coalesce((data->>'archived')::boolean,false),version=version+1 where id=rid and version=expected_version;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'Data telah berubah. Muat ulang sebelum menyimpan.' using errcode='40001'; end if;
  end if;
  perform private.audit('save','products',rid::text,data);
  return rid;
end $$;
revoke all on function public.save_product(jsonb,uuid,integer) from public,anon,authenticated;
grant execute on function public.save_product(jsonb,uuid,integer) to authenticated;

-- Apply the brand/tax defaults only to the untouched starter row. Existing settings survive.
update public.settings set
  company_name='Global Medika Indonesia',
  logo_path=coalesce(logo_path,'brand:gmi-logo'),
  tax_percent=case when tax_percent=0 then 11 else tax_percent end,
  tax_enabled=case when tax_percent=0 then true else tax_enabled end,
  tax_mode=case when tax_percent=0 then 'included' else tax_mode end,
  tax_base=case when tax_percent=0 then 'products' else tax_base end
where company_name='Perusahaan Anda';

commit;
