#!/usr/bin/env python3
"""Convert GMI's HARGA GMI 2026 workbook into an idempotent SQL reference seed.

Usage: python3 scripts/import-gmi-catalog.py '/path/to/HARGA GMI 2026.xlsx'
The seed intentionally leaves purchase_price NULL; list prices are not modal.
"""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
AS_OF = "2026-07-01"


def workbook_sheets(path):
    with zipfile.ZipFile(path) as z:
        strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            strings = ["".join(t.text or "" for t in si.findall(".//m:t", NS)) for si in root.findall("m:si", NS)]
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        targets = {x.attrib["Id"]: x.attrib["Target"] for x in rels}
        result = {}
        for sheet in wb.findall("m:sheets/m:sheet", NS):
            target = targets[sheet.attrib[f"{{{NS['r']}}}id"]].lstrip("/")
            if not target.startswith("xl/"):
                target = "xl/" + target
            root = ET.fromstring(z.read(target))
            rows = []
            for row in root.findall(".//m:sheetData/m:row", NS):
                cells = {}
                for cell in row.findall("m:c", NS):
                    ref = re.match(r"([A-Z]+)", cell.attrib["r"]).group(1)
                    value = cell.find("m:v", NS)
                    if cell.attrib.get("t") == "inlineStr":
                        text = "".join(t.text or "" for t in cell.findall(".//m:t", NS))
                    elif value is None:
                        text = ""
                    elif cell.attrib.get("t") == "s":
                        text = strings[int(value.text)]
                    else:
                        text = value.text
                    cells[ref] = text.strip()
                rows.append(cells)
            result[sheet.attrib["name"]] = rows
        return result


def q(value):
    return "'" + str(value).replace("'", "''") + "'"


def slug(s):
    return re.sub(r"[^A-Z0-9]+", "-", s.upper()).strip("-")[:70]


def catalog_rows(sheets):
    entries = []
    for sheet, brand, source in [
        ("EGENS", "EGENS", "HARGA GMI 2026 - Adinda (Juli 2026)"),
        ("NSR", "NEW STANDAREAGEN", "HARGA GMI 2026 - Adinda (Juli 2026)"),
        ("SR - AKD", "STANDAREAGEN", "HARGA GMI 2026 - Adinda (Juli 2026)"),
        ("ESIGHT", "ESIGHT", "HARGA GMI 2026 - Adinda (Juli 2026)"),
    ]:
        category = "Umum"
        for row in sheets[sheet]:
            sku, name = row.get("A", ""), row.get("B", "")
            if not name and sku and not re.fullmatch(r"[A-Z0-9]+", sku):
                category = sku.replace(brand, "").strip().title() or "Umum"
                continue
            if not name or not re.fullmatch(r"[A-Z0-9]+", sku):
                continue
            try:
                pack = int(float(row.get("D", "1")))
                unit_price, box_price = float(row["E"]), float(row["F"])
            except (KeyError, ValueError):
                continue
            item_type = row.get("C", "")
            if pack > 1:
                entries.append((sku + "-TEST", name, brand, f"{item_type} · satuan", category, "test", unit_price, pack, source, AS_OF))
                entries.append((sku + "-BOX", name, brand, f"{item_type} · isi {pack} test", category, "box", box_price, pack, source, AS_OF))
            else:
                unit = "cup" if item_type.casefold() == "cup" else "pcs"
                entries.append((sku, name, brand, item_type, category, unit, unit_price, None, source, AS_OF))
    # Supplier tab has old, tax-inclusive box quotes, kept explicitly as stale references.
    for row in sheets["SINY (SUPPLIER)"]:
        name = row.get("B", "")
        if not name or not row.get("G", ""):
            continue
        try:
            price = float(row["G"])
        except ValueError:
            continue
        sku = "SINY-" + slug(name)
        variant = " · ".join(x for x in [row.get("C", ""), row.get("D", ""), row.get("E", ""), row.get("F", "")] if x)
        entries.append((sku, name, "SINY", variant, "Tabung pengambilan darah", "box", price, 100,
                        "Daftar supplier SINY (Januari 2024; perlu verifikasi)", "2024-01-01"))
    return entries


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    sheets = workbook_sheets(sys.argv[1])
    entries = catalog_rows(sheets)
    dest = Path("supabase/seeds/gmi_catalog.sql")
    values = []
    for sku, name, brand, variant, category, unit, price, pack, source, as_of in entries:
        values.append("(" + ",".join([
            q(sku), q(name), q(brand), q(variant), q(category), q(unit), "null", str(price), "true", q(as_of), q(source),
            "null" if pack is None else str(pack),
        ]) + ")")
    dest.write_text("""-- Generated from HARGA GMI 2026 - Adinda.xlsx. Review list prices before use.
-- Reference/list prices only: purchase_price is deliberately NULL and never imported from this workbook.
-- Re-running updates descriptive/reference fields but preserves any real modal entered by staff.
begin;
insert into public.products(sku,name,brand,variant,category,unit,purchase_price,list_price,list_price_tax_included,list_price_as_of,list_price_source,pack_quantity)
values
""" + ",\n".join(values) + """
on conflict (sku) do update set
 name=excluded.name, brand=excluded.brand, variant=excluded.variant,
 category=excluded.category, unit=excluded.unit, list_price=excluded.list_price,
 list_price_tax_included=excluded.list_price_tax_included,
 list_price_as_of=excluded.list_price_as_of, list_price_source=excluded.list_price_source,
 pack_quantity=excluded.pack_quantity;
commit;
""", encoding="utf-8")
    print(f"Wrote {len(entries)} reference catalog rows to {dest}")


if __name__ == "__main__":
    main()
