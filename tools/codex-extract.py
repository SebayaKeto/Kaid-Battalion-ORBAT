"""Pull the Codex sheet into codex-data.json word for word, and export the images.
usage: python3 -I extract.py <xlsx> <unzipped dir> <out json> <out image dir>
"""
import json, os, re, sys
import openpyxl
from openpyxl.utils import column_index_from_string as ci, get_column_letter as cl
from PIL import Image

XLSX, UNZ, OUT, IMGDIR = sys.argv[1:5]
wb = openpyxl.load_workbook(XLSX)


def clean(v):
    """Cell text as written. Runs of 3+ spaces were used to force line breaks
    in the sheet, so they become line breaks. Nothing else changes."""
    if v is None:
        return ""
    if isinstance(v, float):
        v = int(v) if v.is_integer() else v
    s = str(v).replace("\r", "")
    lines = []
    for line in s.split("\n"):
        parts = [p.rstrip() for p in re.split(r" {3,}", line)]
        lines.extend(parts)
    s = "\n".join(lines).strip("\n")
    # The ARF team became the Rangers (Connor, Nov 2026).
    s = s.replace("(ARF)", "(Rangers)")
    return s.strip()


def C(ws, ref):
    return clean(wb[ws][ref].value)


def comments(ws):
    out = {}
    for row in wb[ws].iter_rows():
        for c in row:
            if c.comment:
                out[c.coordinate] = clean(c.comment.text)
    return out


def off(col, n):
    return cl(ci(col) + n)


# ── images: map (sheet number, anchor cell) -> media file ──────────────────
def anchors(n):
    d = open(f"{UNZ}/xl/drawings/drawing{n}.xml").read()
    rels = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', open(f"{UNZ}/xl/drawings/_rels/drawing{n}.xml.rels").read()))
    res = {}
    for a in re.findall(r"<xdr:(?:oneCellAnchor|twoCellAnchor)[^>]*>.*?</xdr:(?:oneCellAnchor|twoCellAnchor)>", d, re.S):
        fr = re.search(r"<xdr:from><xdr:col>(\d+)</xdr:col>.*?<xdr:row>(\d+)</xdr:row>", a, re.S)
        emb = re.search(r'r:embed="(rId\d+)"', a)
        if emb:
            res[cl(int(fr.group(1)) + 1) + str(int(fr.group(2)) + 1)] = os.path.basename(rels[emb.group(1)])
    return res


os.makedirs(IMGDIR, exist_ok=True)
exported = {}


def img(sheet_no, cell, name, kind):
    """Export one image. kind: 'icon' (small insignia/emblems) or 'photo'."""
    src = anchors(sheet_no).get(cell)
    if not src:
        return None
    if name in exported:
        return exported[name]
    im = Image.open(f"{UNZ}/xl/media/{src}")
    if kind == "photo":
        im = im.convert("RGBA" if ("A" in im.mode or "transparency" in im.info) else "RGB")
        im.thumbnail((720, 720))
        fn = f"{name}.webp"
        im.save(f"{IMGDIR}/{fn}", "WEBP", quality=82)
    else:
        im = im.convert("RGBA")
        im.thumbnail((256, 256))
        fn = f"{name}.png"
        im.save(f"{IMGDIR}/{fn}", "PNG", optimize=True)
    exported[name] = fn
    return fn


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


D = {}

# ── Points ──────────────────────────────────────────────────────────────────
P = "Points"
pc = comments(P)
mil_rows = []
# milestone grid: rows 13..33, cells keep their row spans from the sheet
ws = wb[P]
spans = {}
for r in ws.merged_cells.ranges:
    spans[(r.min_row, r.min_col)] = r.max_row - r.min_row + 1
for row in range(13, 34):
    cells = {}
    for key, col in (("pts", "N"), ("inf", "P"), ("av", "R")):
        v = C(P, f"{col}{row}")
        top = ws[f"{col}{row}"]
        # skip rows covered by a span from above
        covered = any(r.min_row < row <= r.max_row and r.min_col == ci(col) for r in ws.merged_cells.ranges)
        if covered:
            continue
        cells[key] = {"text": v, "rows": spans.get((row, ci(col)), 1)}
    mil_rows.append({"row": row, **cells})
D["points"] = {
    "title": C(P, "H2"),
    "rules": {"heading": C(P, "B7"), "text": C(P, "B12")},
    "gain": {"heading": C(P, "H7"), "text": C(P, "H12"),
             "maxHeading": C(P, "H16"), "maxNote": C(P, "H17"), "maxValue": C(P, "I18")},
    "notQualify": {"heading": C(P, "B24"), "items": [C(P, f"B{r}") for r in range(30, 37) if C(P, f"B{r}")]},
    "qualifies": {"heading": C(P, "H24"), "items": [C(P, f"H{r}") for r in range(30, 38) if C(P, f"H{r}")],
                  "notes": {C(P, "H37"): pc.get("H37", "")}},
    "milestones": {"heading": C(P, "N7"), "cols": [C(P, "N12"), C(P, "P12"), C(P, "R12")], "rows": mil_rows},
    "key": {"heading": C(P, "N37"), "items": [[C(P, f"N{r}"), C(P, f"P{r}")] for r in range(38, 49)]},
    "note": {"heading": C(P, "F39"), "text": C(P, "E40")},
}

# ── Activity Requirements ──────────────────────────────────────────────────
A = "Activity Requirements"
statuses = []
for col in "BFJNR":
    reqs = [C(A, f"{col}{r}") for r in (11, 15, 19, 23, 28) if C(A, f"{col}{r}")]
    statuses.append({"name": C(A, f"{col}7"), "requirements": reqs, "timeout": C(A, f"{col}36")})
D["activity"] = {"title": C(A, "I2"), "statuses": statuses}

# ── Discharge Policy ────────────────────────────────────────────────────────
DP = "Discharge Policy"
types = []
for col in "DINS":
    types.append({"name": C(DP, f"{col}12"),
                  "points": [C(DP, f"{col}{r}") for r in (16, 20, 24, 28, 32, 36) if C(DP, f"{col}{r}")]})
steps = []
for col in "DGJMPS":
    steps.append({"label": C(DP, f"{col}51"), "text": C(DP, f"{col}53")})
D["discharge"] = {"typesTitle": C(DP, "K5"), "types": types, "stepsTitle": C(DP, "K44"), "steps": steps}

# ── Unit Ranks ──────────────────────────────────────────────────────────────
R = "Unit Ranks"
rc = comments(R)
cols = ["B", "F", "J", "N", "R", "V", "Z", "AD", "AH", "AL", "AP", "AT", "AX"]


def split_rank(s):
    m = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", s.replace("\n", " ").strip(), re.S)
    return (m.group(1).strip(), m.group(2).strip()) if m else (s, "")


def rank(col, rname, rdesc, extra=None, icon_row=None, group=""):
    full = C(R, f"{col}{rname}")
    name, abbr = split_rank(full)
    d = {"cell": full, "name": name, "abbr": abbr, "description": C(R, f"{col}{rdesc}")}
    if extra:
        d["notes"] = C(R, f"{col}{extra}")
    if f"{col}{rname}" in rc:
        d["requirements"] = rc[f"{col}{rname}"]
    if icon_row:
        d["insignia"] = img(4, f"{col}{icon_row}", f"rank-{group}-{slug(abbr or name)}", "icon")
    return d


infantry = [rank(c, 2, 20, 30, 6, "inf") for c in cols]
fynock = [rank(c, 37, 55, None, 41, "fyn") for c in cols[:7]]
navy = [rank(c, 37, 55, None, 45, "navy") for c in cols[7:]]
navy[-1]["insignia"] = img(4, "AX41", "rank-navy-capt", "icon")
D["ranks"] = {"infantry": infantry, "fynock": fynock, "navy": navy}

# ── Unit Leadership ─────────────────────────────────────────────────────────
L = "Unit Leadership"


def leader(cell, cs_label, cs_val, photo=None, pname=None):
    t = C(L, cell)
    lines = [x.strip() for x in t.split("\n") if x.strip()]
    who = [x for x in lines if re.match(r"^([A-Z]{2,4}-\d{3,4}\b|CAPT\b|N/A$)", x)]
    d = {"cell": t, "billet": " ".join(x for x in lines if x not in who), "holder": "\n".join(who),
         "callsignLabel": C(L, cs_label), "callsign": C(L, cs_val)}
    if photo:
        d["photo"] = img(5, photo, pname, "photo")
    return d


D["leadership"] = {
    "title": C(L, "B2"),
    "groups": [
        {"heading": "", "leaders": [
            leader("H5", "H24", "I24", "H9", "lead-navy-command"),
            leader("L5", "L24", "M24", "L9", "lead-bc"),
            leader("P5", "P24", "Q24", "P9", "lead-bsm")]},
        {"heading": C(L, "B28"), "leaders": [
            leader("F31", "F50", "G50", "F35", "lead-1co-cc"),
            leader("J31", "J50", "K50", "J35", "lead-emblem"),
            leader("N31", "N50", "O50", "N35", "lead-2co-cc"),
            leader("R31", "R50", "S50", "R35", "lead-emblem")]},
        {"heading": C(L, "B54"), "leaders": [leader(f"{c}{r}", f"{c}{r+3}", f"{off(c,1)}{r+3}") for r in (57, 64) for c in "DHLPT"]},
        {"heading": C(L, "B71"), "leaders": [leader(f"{c}{r}", f"{c}{r+3}", f"{off(c,1)}{r+3}") for r in (74, 80, 86) for c in "FJNR" if C(L, f"{c}{r}")]},
    ],
}

# ── Quals and Certs ─────────────────────────────────────────────────────────
Q = "Quals and Certs"
qc = comments(Q)


def qitem(s):
    flat = s.split("\n")
    m = re.search(r"\(([^)]+)\)\s*$", flat[0])
    if not m and len(flat) > 1:
        m = re.search(r"^\(([^)]+)\)$", flat[1].strip())
    return {"text": s, "abbr": m.group(1) if m else ""}


D["quals"] = {
    "title": C(Q, "H2"),
    "qualifications": {"heading": C(Q, "G7"), "about": qc.get("G7", ""), "items": [qitem(C(Q, f"G{r}")) for r in range(9, 50, 2) if C(Q, f"G{r}")]},
    "certifications": {"heading": C(Q, "K7"), "about": qc.get("K7", ""), "items": [qitem(C(Q, f"K{r}")) for r in range(9, 50, 2) if C(Q, f"K{r}")]},
}

# ── Billet Regulations ──────────────────────────────────────────────────────
B = "Billet Regulations"
groups_def = [
    ("B2", 5, list("BFJNRV"), (9, 18), None),
    ("B22", 25, list("BFJNRV"), (44, 51), 29),
    ("B56", 59, list("FJNR"), (78, 85), 63),
    ("B89", 92, list("FJNR"), (111, 118), 96),
    ("B122", 125, list("BFJNRV") + ["Z"], (144, 151), 129),
]
bgroups = []
for head, nrow, bcols, (r0, r1), irow in groups_def:
    billets = []
    for c in bcols:
        name = C(B, f"{c}{nrow}")
        fields = []
        for r in range(r0, r1 + 1):
            lab = C(B, f"{c}{r}")
            if lab:
                fields.append([lab, C(B, f"{off(c,1)}{r}")])
        b = {"name": name, "id": slug(name), "fields": fields}
        if irow:
            cell = f"{c}{irow}" if not (c == "Z" and irow == 129) else "Z128"
            b["image"] = img(8, cell, f"billet-{slug(name)}", "photo")
        billets.append(b)
    bgroups.append({"heading": C(B, head), "billets": billets})
D["billets"] = {
    "groups": bgroups,
    "qa": {"heading": C(B, "F154"), "intro": C(B, "G155"),
           "items": [C(B, f"G{r}") for r in range(157, 169) if C(B, f"G{r}")]},
}

# ── Billet Kit Contents ─────────────────────────────────────────────────────
K = "Billet Kit Contents"
kcols = ["F", "J", "N", "R", "V", "Z", "AD", "AH", "AL", "AP", "AT", "AX", "BB", "BF", "BJ"]
kits = []
for c in kcols:
    name = C(K, f"{c}2")
    start = [C(K, f"{c}{r}") for r in range(7, 26) if C(K, f"{c}{r}")]
    k = {"name": name, "id": slug(name), "startHeading": C(K, f"{c}6"), "starting": start}
    extra = C(K, f"{c}29")
    if extra:
        k["extraName"] = extra
        k["extraHeading"] = C(K, f"{c}33")
        k["extra"] = [C(K, f"{c}{r}") for r in range(34, 40) if C(K, f"{c}{r}")]
    kits.append(k)
D["kits"] = {
    "resupply": {"heading": C(K, "B6"), "items": [C(K, f"B{r}") for r in (8, 13, 16, 20, 29)]},
    "kits": kits,
}

# ── Uniform Regulations ─────────────────────────────────────────────────────
U = "Uniform Regulations"
D["uniform"] = {
    "title": C(U, "G2"),
    "general": [C(U, "E6"), C(U, "I6")],
    "accessories": [
        {"name": C(U, "C10"), "rules": [C(U, "C11"), C(U, "C12")]},
        {"name": C(U, "G10"), "rules": [C(U, "G11")]},
        {"name": C(U, "K10"), "rules": [C(U, "K11"), C(U, "K12")]},
        {"name": C(U, "C14"), "rules": [C(U, "C15"), C(U, "C17")]},
        {"name": C(U, "D14"), "rules": [C(U, "D15"), C(U, "D17")]},
        {"name": C(U, "G14"), "rules": [C(U, "G15")]},
        {"name": C(U, "G18"), "rules": [C(U, "G19")]},
        {"name": C(U, "K14"), "rules": [C(U, "K15")]},
        {"name": C(U, "L14"), "rules": [C(U, "L15")]},
    ],
    "exceptions": {"heading": C(U, "F23"), "text": C(U, "F24")},
    "custom": [
        {"name": C(U, f"{c}28"), "rules": [C(U, f"{c}{r}") for r in range(32, 64) if C(U, f"{c}{r}")]}
        for c in "CGK"
    ],
}

# ── Rank Equivalence ────────────────────────────────────────────────────────
E = "Rank Equivalence Chart"
D["equivalence"] = {
    "title": C(E, "C2"),
    "cols": [C(E, "B7"), C(E, "F7")],
    "rows": [[C(E, f"B{r}"), C(E, f"F{r}")] for r in range(9, 26, 2)],
}

json.dump(D, open(OUT, "w"), indent=1, ensure_ascii=False)
print("images:", len(exported))
