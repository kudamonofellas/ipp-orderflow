# Generates src/data/products.js from the parsed Accurate catalog CSV.
# `name` is a clean GENERAL display name: origin abbrev + cut + grade, NO brand.
# `accurateName` keeps the original (the recognizer matches against it).
import csv, json, re, os

SRC = r"C:\Users\winat\Downloads\IPP_Product_Master.csv"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "data", "products.js")

KEEP_UPPER = {"US","A5","A4","CL","MB","NR","YP","ECT","AMG","WMPG","IBP","PE","NE","XL","2L","3L","L","M","S","Q1"}

# Only real COUNTRIES get a prefix (Seafood/Lamb/Poultry/etc. are categories, not origins).
ORIGIN_ABBR = {"Australia":"Aus","Japan":"Jpn","USA":"US","Brazil":"Bra","New Zealand":"NZ","India":"Ind"}
NAT_WORDS = {
    "Australia": {"AUS","AUSTRALIA","AUSTRALIAN"},
    "Japan":     {"JPN","JAPAN","JAPANESE"},
    "USA":       {"US","USA","AMERICAN"},
    "Brazil":    {"BRA","BRAZIL","BRAZILIAN","BRZL","BRZ"},
    "New Zealand": {"NZ","ZEALAND"},
    "India":     {"IND","INDIA","INDIAN"},
}
FORM_EXPAND = {"ST": "Steak", "SL": "Slice"}

# Curated display names for items the auto-rule can't normalize — the seafood/sashimi
# source names mix Indonesian + English and carry no country field. Add to this as needed.
OVERRIDES = {
    "KERANG HOKKAIDO SCALLOP 2L 1KG": "Jpn Hokkaido Scallop 2L",
    "KERANG HOKKIGAI M": "Jpn Hokkigai M",
}

def pretty_word(w):
    if any(c.isdigit() for c in w) or "+" in w:
        return w
    if w.upper() in KEEP_UPPER:
        return w.upper()
    return w[:1].upper() + w[1:].lower() if w else w

def clean_display(name_raw, origin, brand):
    s = " " + name_raw.upper() + " "
    if brand:  # drop the brand word(s) — e.g. CARARA, EBONY, FULL BLOOD CABASSI
        s = re.sub(r"(?<=\s)" + re.escape(brand.upper()) + r"(?=\s)", " ", s)
    s = re.sub(r"\b\dGR\b", " ", s)  # uncaptured brand/grade codes like 2GR, 3GR
    # marbling: ranges lose the '+' (8-9+ -> 8-9); singles keep it (3+ stays 3+)
    s = re.sub(r"(\d\s*-\s*\d)\+", r"\1", s)
    out = [FORM_EXPAND.get(w, pretty_word(w)) for w in s.split()]
    core = re.sub(r"\s+", " ", " ".join(out)).strip()
    pre = ORIGIN_ABBR.get(origin.strip(), "")
    if pre and ({t.upper() for t in core.split()} & NAT_WORDS.get(origin.strip(), set())):
        pre = ""  # name already states the country — don't double it
    return (pre + " " + core).strip() if pre else core

def slug(s, i):
    base = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return (base[:46] or "item") + "-" + str(i)

rows = []
with open(SRC, encoding="utf-8-sig") as f:
    for i, r in enumerate(csv.DictReader(f)):
        if (r.get("non_product") or "").strip().lower() == "true":
            continue
        name_raw = r["item_name"].strip()
        origin = r["origin"].strip()
        brand = (r.get("brand") or "").strip()
        ppn = "11%" if "11%" in (r.get("ppn_guess") or "") else "exempt"
        rows.append({
            "id": slug(name_raw, i),
            "name": OVERRIDES.get(name_raw, clean_display(name_raw, origin, brand)),
            "accurateName": name_raw,
            "category": r["category"].strip(),
            "origin": origin,
            "grade": (r.get("grade") or "").strip(),
            "brand": brand,
            "form": (r.get("form") or "").strip(),
            "pack": (r.get("pack") or "").strip(),
            "catchWeight": (r.get("catch_weight") or "").strip().lower() == "true",
            "fixedPack": (r.get("fixed_pack") or "").strip().lower() == "true",
            "ppn": ppn,
        })

with open(OUT, "w", encoding="utf-8") as f:
    f.write("// Auto-generated from IPP_Product_Master.csv — the real Accurate catalog.\n")
    f.write("// Regenerate with: python scripts/gen_products.py\n")
    f.write("export const products = " + json.dumps(rows, ensure_ascii=False, indent=2) + "\n\n")
    f.write("export const categories = " + json.dumps(sorted({r['category'] for r in rows})) + "\n")

print("wrote", OUT, "with", len(rows), "products")
