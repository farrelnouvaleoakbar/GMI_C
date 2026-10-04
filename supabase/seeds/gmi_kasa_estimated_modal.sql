-- Derived factory-price estimates from Proyeksi & Survey Katalog.xlsx.
-- These are provisional modal estimates (market unit price / 1.20), not supplier quotes.
-- On conflict, fill a missing modal only; preserve any non-NULL actual modal already entered.
begin;
insert into public.products(sku,name,brand,variant,category,unit,purchase_price,list_price,list_price_tax_included,list_price_source,pack_quantity)
values
('KASA-KASA-STERIL-101610-BOX-ISI-20-POUCH-X-10-LEMBAR-10X10CM-16-PLY-10-PCS-10X10CM-16-PLY','Kasa Steril 101610 Box Isi 20 Pouch x 10 Lembar – 10x10cm 16 ply 10 pcs','ONEMED','10x10cm, 16 ply','Kasa steril · estimasi modal survei 20%','pcs',883,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',200),
('KASA-KASA-STERIL-1085-ONEMED-10X10CM-8-PLY-5-PCS-10X10CM-8-PLY','Kasa Steril 1085 OneMed 10x10cm 8 ply 5 pcs','ONEMED','10x10cm, 8 ply','Kasa steril · estimasi modal survei 20%','pcs',833,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',5),
('KASA-KASA-STERIL-10810-ONEMED-10-X10-CM-8-PLY-ISI-10-10X10CM-8-PLY','Kasa Steril 10810 Onemed 10 X10 Cm 8 Ply Isi 10','ONEMED','10x10cm, 8 ply','Kasa steril · estimasi modal survei 20%','pcs',767,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',10),
('KASA-KASA-STERIL-71610-LD-ONEMED-7-5-7-5CM-16-PLY-10-PCS-7-5X7-5CM-16-PLY-LD-LIPATAN-DALAM','Kasa Steril 71610 LD OneMed 7.5×7.5cm 16 ply 10 pcs','ONEMED','7.5x7.5cm, 16 ply, LD (Lipatan Dalam)','Kasa steril · estimasi modal survei 20%','pcs',1125,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',10),
('KASA-KASA-STERIL-ONEMED-7-5-7-5CM-16-PLY-ISI-5-7-5X7-5CM-16-PLY','Kasa Steril OneMed 7.5×7.5cm 16 ply isi 5','ONEMED','7.5x7.5cm, 16 ply','Kasa steril · estimasi modal survei 20%','pcs',783,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',5),
('KASA-KASA-STERIL-7-5-X-7-5-CM-ONEMED-8-PLY-ISI-2-LEMBAR-BOX-ISI-25-POUCH-7-5X7-5CM-8-PLY','Kasa Steril 7,5 x 7,5 cm OneMed 8 ply Isi 2 Lembar Box isi 25 Pouch','ONEMED','7.5x7.5cm, 8 ply','Kasa steril · estimasi modal survei 20%','pcs',350,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',50),
('KASA-KASA-STERIL-LD-ONEMED-5-X-7-CM-16-PLY-10-PCS-5X7CM-16-PLY-LD','Kasa Steril LD OneMed 5 x 7 Cm 16 Ply 10 Pcs','ONEMED','5x7cm, 16 ply, LD','Kasa steril · estimasi modal survei 20%','pcs',750,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',10),
('KASA-ONEMED-KASA-STERIL-5X5CM-BOX-ISI-12-PCS-KS-B-512-KSB-512-5X5CM-8-PLY','ONEMED Kasa Steril 5x5cm box isi 12 Pcs – KS B-512 KSB 512','ONEMED','5x5cm, 8 ply','Kasa steril · estimasi modal survei 20%','pcs',243,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',12),
('KASA-KASA-HIDROFIL-ONEMED-40YARDX80CM-SUPER-GRADE-WITH-XRAY-LINE-ROLL-40YARDX80CM','Kasa Hidrofil OneMed 40yardx80cm Super Grade With Xray Line roll','ONEMED','40yardx80cm','Kasa non steril · estimasi modal survei 20%','roll',206667,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',null),
('KASA-KASA-ROLL-NON-STERIL-5-CM-5CM-BAL-1KG','Kasa Roll Non Steril 5 cm','','5cm, bal(1kg)','Kasa non steril · estimasi modal survei 20%','bal',64750,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',null),
('KASA-KASA-NON-STERIL-HUSADA-12-PCS-BOX-16X16CM','Kasa Non Steril Husada, 12 pcs Box','','16x16cm','Kasa non steril · estimasi modal survei 20%','pcs',590,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',12),
('KASA-KASA-HIDROFIL-CUPLIK-NON-STERIL-16-PCS-BOX-16X16CM','Kasa Hidrofil Cuplik Non Steril 16 pcs Box','','16x16cm','Kasa non steril · estimasi modal survei 20%','pcs',491,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',16),
('KASA-ONEMED-KASA-ROLL-NON-STERIL-10-ROLL-5CM-X-4M','ONEMED Kasa Roll Non Steril 10 Roll','ONEMED','5cm x 4m','Kasa non steril · estimasi modal survei 20%','roll',1833,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',10),
('KASA-ONEMED-KASA-ROLL-NON-STERIL-5-ROLL-10CM-X-4M','ONEMED Kasa Roll Non Steril 5 Roll','ONEMED','10cm x 4m','Kasa non steril · estimasi modal survei 20%','roll',3667,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',5),
('KASA-ONEMED-KASA-ROLL-NON-STERIL-5-ROLL-15CM-X-4M','ONEMED Kasa Roll Non Steril 5 Roll','ONEMED','15cm x 4m','Kasa non steril · estimasi modal survei 20%','roll',3667,null,false,'Proyeksi & Survey Katalog.xlsx — estimasi harga pabrik dari harga pasar/unit dengan asumsi margin 20%',5)
on conflict (sku) do update set
 name=excluded.name, brand=excluded.brand, variant=excluded.variant,
 category=case when public.products.purchase_price is null then excluded.category else public.products.category end,
 unit=excluded.unit,
 purchase_price=coalesce(public.products.purchase_price,excluded.purchase_price),
 list_price_source=excluded.list_price_source, pack_quantity=excluded.pack_quantity;
commit;
