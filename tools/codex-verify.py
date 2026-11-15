"""Every non-empty cell and note on the visible tabs must appear word for word in the Codex data."""
import json, re, sys, importlib.util
import openpyxl
xlsx, data = sys.argv[1], sys.argv[2]
norm = lambda s: re.sub(r"\s+", " ", str(s)).strip()
num = lambda v: str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)
leaves = set()
def walk(o):
    if isinstance(o, dict): [walk(v) for v in o.values()]
    elif isinstance(o, list): [walk(v) for v in o]
    elif isinstance(o, str): leaves.add(norm(o))
walk(json.load(open(data)))
wb = openpyxl.load_workbook(xlsx)
missing = total = 0
for ws in wb.worksheets:
    if ws.sheet_state != "visible": continue
    for row in ws.iter_rows():
        for c in row:
            for kind, v in (("cell", c.value), ("note", c.comment.text if c.comment else None)):
                if v is None or str(v).strip() == "": continue
                total += 1
                if norm(num(v)) not in leaves:
                    missing += 1; print(f"MISSING {ws.title}!{c.coordinate} ({kind}): {norm(num(v))[:120]}")
print(f"{total} cells/notes checked, {missing} missing")
