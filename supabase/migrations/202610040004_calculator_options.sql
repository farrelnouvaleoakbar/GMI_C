begin;
alter table public.settings
  add column tax_enabled boolean not null default false,
  add column tax_name text not null default 'PPN',
  add column tax_mode text not null default 'added' check (tax_mode in ('added','included')),
  add column tax_base text not null default 'products_shipping' check (tax_base in ('products','products_shipping'));
update public.settings set tax_enabled=(tax_percent>0);
create or replace view public.api_settings with (security_invoker=true) as
 select id,company_name,address,contact,logo_path,tax_percent::text,profit_percent::text,
 marketing_percent::text,operational_percent::text,invoice_prefix,next_invoice,version,
 tax_enabled,tax_name,tax_mode,tax_base from public.settings;

create or replace function public.save_settings(data jsonb, expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_role(array['admin']);
 if 1-(data->>'marketing_percent')::numeric/100-(data->>'operational_percent')::numeric/100*(1+(data->>'profit_percent')::numeric/100)<=0 then raise exception 'Default harga tidak valid: penyebut harus lebih besar dari nol.'; end if;
 update public.settings set company_name=data->>'company_name',address=data->>'address',contact=data->>'contact',logo_path=data->>'logo_path',tax_percent=(data->>'tax_percent')::numeric,tax_enabled=coalesce((data->>'tax_enabled')::boolean,false),tax_name=coalesce(nullif(data->>'tax_name',''),'PPN'),tax_mode=coalesce(data->>'tax_mode','added'),tax_base=coalesce(data->>'tax_base','products_shipping'),profit_percent=(data->>'profit_percent')::numeric,marketing_percent=(data->>'marketing_percent')::numeric,operational_percent=(data->>'operational_percent')::numeric,invoice_prefix=data->>'invoice_prefix',version=version+1 where id and version=expected_version;
 if not found then raise exception 'Pengaturan telah berubah. Muat ulang.' using errcode='40001'; end if;
 perform private.audit('save','settings','true',data);
end $$;

create or replace function private.prevent_provisional_invoice() returns trigger
language plpgsql set search_path = '' as $$
begin
 if coalesce((new.snapshot->>'provisional')::boolean,false) then
  raise exception 'Isi ongkir sebelum menerbitkan invoice.';
 end if;
 return new;
end $$;
create trigger invoice_requires_known_shipping before insert on public.invoices
for each row execute function private.prevent_provisional_invoice();

create or replace function private.calculate(inputs jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 c public.customers; s public.settings; product public.products; item jsonb;
 lines jsonb:='[]'; shipping numeric; provisional boolean; qty_sum numeric:=0;
 q numeric; b numeric; alloc numeric; p numeric; m numeric; o numeric; total_purchase numeric:=0;
 denominator numeric; idx integer:=0; recommended numeric; selected numeric;
 line_total numeric; subtotal numeric:=0; purchase numeric:=0;
 operational numeric:=0; marketing numeric:=0; tax_rate numeric;
 tax_product numeric:=0; tax_shipping numeric:=0; total numeric; revenue numeric;
 profit numeric; step numeric; notes text; tax_options jsonb;
 tax_enabled boolean; tax_name text; tax_mode text; tax_base text;
 ops jsonb; op_item jsonb; op_rate numeric; op_total_rate numeric:=0;
 op_rows jsonb:='[]'; op_amount numeric; target_profit numeric; cost_base numeric;
 correction integer; ord bigint; source_item jsonb; calculated_line jsonb; correction_made boolean;
 old_line_total numeric; corrected_profit numeric; corrected_revenue numeric;
 invoice_date date;
begin
 perform private.require_role(array['admin','sales']);
 select * into c from public.customers where id=(inputs->>'customer_id')::uuid;
 if c.id is null or c.archived or not private.can_own(c.owner_id) then raise exception 'Pelanggan tidak dapat diakses atau telah diarsipkan.' using errcode='42501'; end if;
 select * into s from public.settings where id;
 if inputs->>'due_date' is null then raise exception 'Tanggal jatuh tempo wajib diisi.'; end if;
 invoice_date:=coalesce((inputs->>'invoice_date')::date,(now() at time zone 'Asia/Jakarta')::date);
 if (inputs->>'due_date')::date<invoice_date then raise exception 'Tanggal jatuh tempo tidak boleh mendahului tanggal invoice.'; end if;
 provisional:=inputs->'shipping' is null or inputs->>'shipping' is null or inputs->>'shipping'='';
 shipping:=case when provisional then 0 else (inputs->>'shipping')::numeric end;
 if shipping<0 or shipping<>round(shipping,2) or shipping>1000000000000 then raise exception 'Ongkir harus berupa Rupiah positif dengan maksimal dua desimal.'; end if;
 if jsonb_typeof(inputs->'lines')<>'array' or jsonb_array_length(inputs->'lines') not between 1 and 100 then raise exception 'Tambahkan 1–100 baris produk.'; end if;
 for item in select value from jsonb_array_elements(inputs->'lines') loop
  q:=(item->>'quantity')::numeric; if q is null or q<=0 or q<>trunc(q) or q>1000000 then raise exception 'Jumlah harus bilangan bulat antara 1 dan 1.000.000.'; end if; qty_sum:=qty_sum+q;
  select purchase_price into b from public.products where id=(item->>'product_id')::uuid and not archived;
  if b is null or b<=0 then raise exception 'Harga beli produk belum valid.'; end if;
  total_purchase:=total_purchase+b*q;
 end loop;
 alloc:=shipping/qty_sum;
 tax_options:=coalesce(inputs->'tax','{}'::jsonb);
 tax_enabled:=coalesce((tax_options->>'enabled')::boolean,s.tax_enabled);
 tax_name:=coalesce(nullif(tax_options->>'name',''),s.tax_name);
 tax_mode:=coalesce(tax_options->>'mode',s.tax_mode);
 tax_base:=coalesce(tax_options->>'base',s.tax_base);
 tax_rate:=case when tax_enabled then coalesce((tax_options->>'rate')::numeric,s.tax_percent) else 0 end/100;
 if tax_enabled and length(trim(tax_name))=0 then raise exception 'Isi nama pajak.'; end if;
 if tax_rate not between 0 and 1 or tax_mode not in ('added','included') or tax_base not in ('products','products_shipping') then raise exception 'Pengaturan pajak tidak valid.'; end if;
 ops:=inputs->'operations';
 if jsonb_typeof(ops)='array' then
  for op_item in select value from jsonb_array_elements(ops) loop
   op_rate:=(op_item->>'percent')::numeric/100;
   if op_rate not between 0 and 1 or length(trim(coalesce(op_item->>'name','')))=0 then raise exception 'Biaya operasional tidak valid.'; end if;
   if not exists(select 1 from public.operational_categories where name=op_item->>'name' and not archived) then raise exception 'Kategori operasional tidak tersedia. Muat ulang sebelum menghitung.'; end if;
   op_total_rate:=op_total_rate+op_rate;
  end loop;
 elsif ops is null then
  op_total_rate:=s.operational_percent/100;
 end if;
 for item in select value from jsonb_array_elements(inputs->'lines') limit 1 loop
  p:=coalesce((inputs->>'target_percent')::numeric,(item->>'profit_percent')::numeric,s.profit_percent)/100;
  m:=coalesce((inputs->>'marketing_percent')::numeric,(item->>'marketing_percent')::numeric,s.marketing_percent)/100;
  if ops is null then op_total_rate:=coalesce((item->>'operational_percent')::numeric,s.operational_percent)/100; end if;
 end loop;
 o:=op_total_rate;
 if p not between 0 and 10 or m not between 0 and 1 then raise exception 'Persentase tidak valid.'; end if;
 denominator:=1-m-o*(1+p);
 if denominator<=0 then raise exception 'Target tidak dapat dicapai. Kurangi persentase biaya atau target.'; end if;
 if tax_enabled and tax_mode='included' and tax_base='products_shipping' then tax_shipping:=round(shipping-shipping/(1+tax_rate),2); end if;
 -- Allocate required revenue by each line's share of total purchase cost.
 for item in select value from jsonb_array_elements(inputs->'lines') loop
  select * into product from public.products where id=(item->>'product_id')::uuid;
  if product.id is null or product.archived then raise exception 'Produk tidak ditemukan atau telah diarsipkan.'; end if;
  q:=(item->>'quantity')::numeric; b:=product.purchase_price; purchase:=purchase+b*q; idx:=idx+1;
  recommended:=round((b*q/total_purchase)*(total_purchase*(1+p)+p*shipping+tax_shipping)/denominator/q,8);
  if tax_enabled and tax_mode='included' then recommended:=recommended*(1+tax_rate); end if;
  step:=coalesce((item->>'rounding')::numeric,0); if step not in (0,100,500,1000) then raise exception 'Pembulatan tidak valid.'; end if;
  if step>0 then recommended:=ceil(recommended/step)*step; else recommended:=round(recommended,2); end if;
  selected:=coalesce((item->>'selected_price')::numeric,recommended);
  if selected<0 or selected<>round(selected,2) or selected>1000000000000 then raise exception 'Harga jual tidak valid.'; end if;
  line_total:=round(selected*q,2); subtotal:=subtotal+line_total;
  lines:=lines||jsonb_build_array(jsonb_build_object('line_id',idx::text,'product_id',product.id,'product_version',product.version,'sku',product.sku,'name',product.name,'brand',product.brand,'variant',product.variant,'unit',product.unit,'quantity',q::text,'purchase_price',b::text,'shipping_per_unit',alloc::text,'profit_percent',(p*100)::text,'marketing_percent',(m*100)::text,'operational_percent',(o*100)::text,'recommended_price',recommended::text,'selected_price',selected::text,'line_total',line_total::text,'operational_cost',round(line_total*o,2)::text,'marketing_cost',round(line_total*m,2)::text,'profit',(round(case when tax_enabled and tax_mode='included' then line_total/(1+tax_rate) else line_total end,2)-b*q-round(line_total*o,2)-round(line_total*m,2))::text));
 end loop;
 tax_product:=case when not tax_enabled then 0 when tax_mode='included' then round(subtotal-subtotal/(1+tax_rate),2) else round(subtotal*tax_rate,2) end;
 if tax_enabled and tax_base='products_shipping' and not (tax_mode='included') then tax_shipping:=round(shipping*tax_rate,2); end if;
 revenue:=case when tax_enabled and tax_mode='included' then subtotal-tax_product else subtotal end;
 marketing:=round(revenue*m,2);
 if jsonb_typeof(ops)='array' then
  for op_item in select value from jsonb_array_elements(ops) loop
   op_rate:=(op_item->>'percent')::numeric/100; op_amount:=round(revenue*op_rate,2); operational:=operational+op_amount;
   op_rows:=op_rows||jsonb_build_array(jsonb_build_object('name',op_item->>'name','percent',op_item->>'percent','amount',op_amount::text));
  end loop;
 else operational:=round(revenue*o,2); op_rows:=jsonb_build_array(jsonb_build_object('name','Operasional','percent',(o*100)::text,'amount',operational::text)); end if;
 cost_base:=purchase+shipping+operational; target_profit:=round(cost_base*p,2);
 profit:=revenue-purchase-operational-marketing-case when tax_mode='included' then tax_shipping else 0 end;
 -- Category-by-category cent rounding can put the rounded recommendation just below target.
 -- Raise only automatically recommended lines, never manual prices, by their chosen increment.
 for correction in 1..100 loop
  exit when profit>=target_profit;
  correction_made:=false;
  for source_item,ord in select value,ordinality from jsonb_array_elements(inputs->'lines') with ordinality loop
   if source_item->>'selected_price' is null and coalesce((source_item->>'rounding')::numeric,0)>0 then
    calculated_line:=lines->(ord-1);
    step:=(source_item->>'rounding')::numeric;
    selected:=(calculated_line->>'selected_price')::numeric+step;
    q:=(source_item->>'quantity')::numeric;
    old_line_total:=(calculated_line->>'line_total')::numeric;
    line_total:=round(selected*q,2);
    calculated_line:=jsonb_set(calculated_line,'{recommended_price}',to_jsonb(selected::text));
    calculated_line:=jsonb_set(calculated_line,'{selected_price}',to_jsonb(selected::text));
    calculated_line:=jsonb_set(calculated_line,'{line_total}',to_jsonb(line_total::text));
    corrected_revenue:=round(case when tax_enabled and tax_mode='included' then line_total/(1+tax_rate) else line_total end,2);
    op_amount:=round(corrected_revenue*o,2);
    corrected_profit:=corrected_revenue-b*q-op_amount-round(corrected_revenue*m,2);
    calculated_line:=jsonb_set(calculated_line,'{operational_cost}',to_jsonb(op_amount::text));
    calculated_line:=jsonb_set(calculated_line,'{marketing_cost}',to_jsonb(round(corrected_revenue*m,2)::text));
    calculated_line:=jsonb_set(calculated_line,'{profit}',to_jsonb(corrected_profit::text));
    lines:=jsonb_set(lines,array[(ord-1)::text],calculated_line);
    subtotal:=subtotal-old_line_total+line_total;
    correction_made:=true;
    exit;
   end if;
  end loop;
  if not correction_made then exit; end if;
  tax_product:=case when not tax_enabled then 0 when tax_mode='included' then round(subtotal-subtotal/(1+tax_rate),2) else round(subtotal*tax_rate,2) end;
  revenue:=case when tax_enabled and tax_mode='included' then subtotal-tax_product else subtotal end;
  marketing:=round(revenue*m,2); operational:=0; op_rows:='[]'::jsonb;
  if jsonb_typeof(ops)='array' then
   for op_item in select value from jsonb_array_elements(ops) loop
    op_rate:=(op_item->>'percent')::numeric/100; op_amount:=round(revenue*op_rate,2); operational:=operational+op_amount;
    op_rows:=op_rows||jsonb_build_array(jsonb_build_object('name',op_item->>'name','percent',op_item->>'percent','amount',op_amount::text));
   end loop;
  else operational:=round(revenue*o,2); op_rows:=jsonb_build_array(jsonb_build_object('name','Operasional','percent',(o*100)::text,'amount',operational::text)); end if;
  cost_base:=purchase+shipping+operational; target_profit:=round(cost_base*p,2);
  profit:=revenue-purchase-operational-marketing-case when tax_mode='included' then tax_shipping else 0 end;
  if correction=100 and profit<target_profit then raise exception 'Persentase terlalu dekat batas rumus. Kurangi biaya atau target.'; end if;
 end loop;
 total:=case when tax_enabled and tax_mode='included' then subtotal+shipping else subtotal+shipping+tax_product+tax_shipping end;
 notes:=coalesce(inputs->>'notes',''); if length(notes)>2000 then raise exception 'Catatan terlalu panjang.'; end if;
 return jsonb_build_object('company',to_jsonb(s)-'next_invoice'-'version','customer',to_jsonb(c)-'created_at'-'version'-'archived','lines',lines,'shipping',shipping::text,'shipping_address',coalesce(inputs->>'shipping_address',''),'shipping_carrier',coalesce(inputs->>'shipping_carrier',''),'provisional',provisional,'minimum_product_revenue',((total_purchase*(1+p)+p*shipping+case when tax_mode='included' then tax_shipping else 0 end)/denominator)::text,'subtotal',subtotal::text,'displayed_subtotal',subtotal::text,'product_revenue',revenue::text,'purchase',purchase::text,'operational',operational::text,'operational_items',op_rows,'marketing',marketing::text,'tax_enabled',tax_enabled,'tax_percent',(tax_rate*100)::text,'tax_name',case when tax_enabled then tax_name else null end,'tax_mode',tax_mode,'tax_product',tax_product::text,'tax_shipping',tax_shipping::text,'tax', (tax_product+tax_shipping)::text,'tax_base',case when tax_base='products_shipping' then (revenue+shipping-case when tax_mode='included' then tax_shipping else 0 end)::text else revenue::text end,'total',total::text,'profit',profit::text,'cost_base',cost_base::text,'total_cost',(cost_base+marketing)::text,'target_profit',target_profit::text,'profit_percent',case when cost_base=0 then '0' else (profit/cost_base*100)::text end,'target_gap',(profit-target_profit)::text,'profit_status',case when profit<0 then 'loss' when profit=0 then 'even' when profit>=target_profit then 'target' else 'below' end,'notes',notes,'invoice_date',invoice_date,'due_date',(inputs->>'due_date')::date,'shipping_rule','Ongkir dibagi sama per unit, ditagihkan sekali sebagai biaya terpisah.');
end $$;
commit;
