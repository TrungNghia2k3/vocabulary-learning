#!/usr/bin/env python3
"""
Two-way cell-level sync between Google Sheets (via Antigravity `gsheets` CLI)
and local CSV files in ./sheets/.

Preserves Google Sheets formatting, merged cells, Tables, colors, and formulas
by reading with `--value-render-option FORMULA` and pushing only changed cells
via `gsheets mutate batch`.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any
import xml.etree.ElementTree as ET
import zipfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent
SYNC_DIR = BASE_DIR / ".sync"
CONFIG_PATH = SYNC_DIR / "config.json"
STATE_PATH = SYNC_DIR / "state.json"
CONFLICTS_PATH = SYNC_DIR / "conflicts.json"
BATCH_TMP_PATH = SYNC_DIR / "_batch_tmp.json"
TASK1_IMAGE_SHEETS = {"IELTS Chart", "IELTS Map", "IELTS Map ", "IELTS Process"}
TASK1_PUBLIC_DIR = BASE_DIR / "web-app" / "public" / "task1-images"
TASK1_MANIFEST_PATH = BASE_DIR / "sheets" / "_task1_images.json"


def extract_task1_images(spreadsheet_id: str) -> dict[str, dict[str, str]]:
    """Export spreadsheet as .xlsx temporarily to extract embedded/pasted images on IELTS Task 1 sheets."""
    tmp_xlsx = SYNC_DIR / "_media_tmp.xlsx"
    manifest: dict[str, dict[str, str]] = {}
    try:
        run_gsheets(["readonly", "export", spreadsheet_id, str(tmp_xlsx), "--format", "xlsx"])
        TASK1_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(tmp_xlsx) as z:
            names = set(z.namelist())
            wb = ET.fromstring(z.read("xl/workbook.xml"))
            wb_rels = {
                r.attrib["Id"]: r.attrib["Target"]
                for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
            }
            ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            for sh in wb.findall(".//main:sheet", ns):
                raw_name = sh.attrib["name"]
                clean_name = raw_name.strip()
                if raw_name not in TASK1_IMAGE_SHEETS and clean_name not in TASK1_IMAGE_SHEETS:
                    continue
                rid = sh.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
                target = wb_rels.get(rid, "")
                rel_path = "xl/" + target.replace("worksheets/", "worksheets/_rels/") + ".rels"
                if rel_path not in names:
                    continue
                s_rels = ET.fromstring(z.read(rel_path))
                for rel in s_rels:
                    if "drawing" not in rel.attrib.get("Target", ""):
                        continue
                    d_path = "xl/" + rel.attrib["Target"].replace("../", "")
                    d_rel_path = d_path.replace("drawings/", "drawings/_rels/") + ".rels"
                    if d_rel_path not in names:
                        continue
                    d_rels = {
                        x.attrib["Id"]: x.attrib["Target"].replace("../", "xl/")
                        for x in ET.fromstring(z.read(d_rel_path))
                    }
                    d_xml = ET.fromstring(z.read(d_path))
                    for anc in list(d_xml):
                        fr = anc.find(
                            ".//{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}from"
                        )
                        row_el = (
                            fr.find(
                                "{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}row"
                            )
                            if fr is not None
                            else None
                        )
                        row_num = int(row_el.text) + 1 if row_el is not None and row_el.text else -1
                        blip = anc.find(".//{http://schemas.openxmlformats.org/drawingml/2006/main}blip")
                        embed_id = (
                            blip.attrib.get(
                                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed",
                                "",
                            )
                            if blip is not None
                            else ""
                        )
                        img_path = d_rels.get(embed_id, "")
                        if row_num > 0 and img_path and img_path in names:
                            ext = Path(img_path).suffix.lower() or ".jpg"
                            slug = re.sub(r"[^a-z0-9]+", "-", clean_name.lower()).strip("-")
                            fname = f"{slug}-r{row_num}{ext}"
                            (TASK1_PUBLIC_DIR / fname).write_bytes(z.read(img_path))
                            manifest.setdefault(clean_name, {})[str(row_num)] = f"/task1-images/{fname}"
        save_json(TASK1_MANIFEST_PATH, manifest)
        total = sum(len(v) for v in manifest.values())
        print(f"Đã trích xuất {total} ảnh đề bài IELTS Task 1 vào web-app/public/task1-images/")
    finally:
        if tmp_xlsx.exists():
            tmp_xlsx.unlink()
    return manifest

EXCEL_ERROR_TOKENS = {"#NAME?", "#VALUE!", "#REF!", "#ERROR!", "#N/A", "#DIV/0!"}


def find_gsheets() -> str:
    exe = shutil.which("gsheets")
    if not exe:
        raise RuntimeError(
            "Không tìm thấy lệnh `gsheets` trong PATH. "
            "Vui lòng chạy lệnh đồng bộ thông qua Antigravity."
        )
    return exe


def run_gsheets(args: list[str]) -> str:
    exe = find_gsheets()
    proc = subprocess.run(
        [exe, *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout).strip()
        raise RuntimeError(f"gsheets {' '.join(args)} thất bại (code {proc.returncode}): {err}")
    return proc.stdout


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def col_to_letters(col_idx: int) -> str:
    """0-based column index -> A1 column letters (0='A', 25='Z', 26='AA')."""
    letters = []
    n = col_idx + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        letters.append(chr(ord("A") + rem))
    return "".join(reversed(letters))


def quote_sheet(title: str) -> str:
    return "'" + title.replace("'", "''") + "'"


def cell_ref(title: str, row: int, col: int) -> str:
    return f"{quote_sheet(title)}!{col_to_letters(col)}{row + 1}"


def range_ref(title: str, row: int, start_col: int, end_col: int) -> str:
    if start_col == end_col:
        return cell_ref(title, row, start_col)
    return (
        f"{quote_sheet(title)}!"
        f"{col_to_letters(start_col)}{row + 1}:{col_to_letters(end_col)}{row + 1}"
    )


def normalize_cell(val: Any) -> str:
    if val is None:
        return ""
    s = str(val)
    return s.replace("\r\n", "\n").replace("\r", "\n")


def normalize_grid(rows: list[list[Any]] | None) -> list[list[str]]:
    if not rows:
        return []
    out: list[list[str]] = []
    for row in rows:
        norm_row = [normalize_cell(c) for c in (row or [])]
        while norm_row and norm_row[-1] == "":
            norm_row.pop()
        out.append(norm_row)
    while out and not out[-1]:
        out.pop()
    return out


def get_cell(grid: list[list[str]], r: int, c: int) -> str:
    if r < len(grid) and c < len(grid[r]):
        return grid[r][c]
    return ""


def set_cell(grid: list[list[str]], r: int, c: int, val: str) -> None:
    while len(grid) <= r:
        grid.append([])
    while len(grid[r]) <= c:
        grid[r].append("")
    grid[r][c] = val


def sanitize_filename(sheet_title: str, used_names: set[str]) -> str:
    clean = re.sub(r'[<>:"/\\|?*]+', "_", sheet_title).strip().rstrip(".")
    if not clean:
        clean = "Sheet"
    candidate = f"{clean}.csv"
    idx = 2
    while candidate.lower() in {u.lower() for u in used_names}:
        candidate = f"{clean}_{idx}.csv"
        idx += 1
    return candidate


def read_local_csv(path: Path) -> list[list[str]]:
    if not path.exists():
        return []
    raw_bytes = path.read_bytes()
    if not raw_bytes:
        return []
    text = None
    for enc in ("utf-8-sig", "utf-8", "cp1258", "cp1252"):
        try:
            text = raw_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw_bytes.decode("utf-8", errors="replace")
    reader = csv.reader(text.splitlines(keepends=True))
    return normalize_grid([row for row in reader])


def write_local_csv(path: Path, grid: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    norm = normalize_grid(grid)
    max_cols = max((len(r) for r in norm), default=0)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        for row in norm:
            padded = row + [""] * (max_cols - len(row))
            writer.writerow(padded)


def fetch_remote_sheets(spreadsheet_id: str) -> tuple[list[dict[str, Any]], dict[str, list[list[str]]]]:
    sheets_meta = json.loads(
        run_gsheets(["readonly", "list-sheets", spreadsheet_id, "--json"])
    )

    def fetch_one(title: str) -> tuple[str, list[list[str]]]:
        rng = f"{quote_sheet(title)}!A:ZZ"
        out = run_gsheets(
            [
                "readonly",
                "read",
                spreadsheet_id,
                rng,
                "--value-render-option",
                "FORMULA",
                "--json",
            ]
        ).strip()
        if not out or out == "null":
            return title, []
        data = json.loads(out)
        return title, normalize_grid(data)

    grids: dict[str, list[list[str]]] = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch_one, s["title"]): s["title"] for s in sheets_meta}
        for fut in as_completed(futures):
            title, grid = fut.result()
            grids[title] = grid

    ordered = {s["title"]: grids[s["title"]] for s in sheets_meta}
    return sheets_meta, ordered


def build_batch_ops(title: str, changes: dict[tuple[int, int], str]) -> list[dict[str, Any]]:
    """Group contiguous changed cells on the same row into write/clear ops."""
    if not changes:
        return []
    rows_map: dict[int, list[tuple[int, str]]] = {}
    for (r, c), val in changes.items():
        rows_map.setdefault(r, []).append((c, val))

    ops: list[dict[str, Any]] = []
    for r in sorted(rows_map):
        cols_vals = sorted(rows_map[r], key=lambda x: x[0])
        i = 0
        while i < len(cols_vals):
            start_c, first_val = cols_vals[i]
            is_clear = first_val == ""
            run_vals = [first_val]
            end_c = start_c
            j = i + 1
            while j < len(cols_vals):
                next_c, next_val = cols_vals[j]
                if next_c == end_c + 1 and (next_val == "") == is_clear:
                    end_c = next_c
                    run_vals.append(next_val)
                    j += 1
                else:
                    break
            rng = range_ref(title, r, start_c, end_c)
            if is_clear:
                ops.append({"op": "clear", "range": rng})
            else:
                ops.append({"op": "write", "range": rng, "data": [run_vals]})
            i = j
    return ops


def execute_batch_ops(spreadsheet_id: str, ops: list[dict[str, Any]], chunk_size: int = 100) -> None:
    if not ops:
        return
    try:
        for i in range(0, len(ops), chunk_size):
            chunk = ops[i : i + chunk_size]
            save_json(BATCH_TMP_PATH, chunk)
            run_gsheets(["mutate", "batch", spreadsheet_id, "-f", str(BATCH_TMP_PATH)])
    finally:
        if BATCH_TMP_PATH.exists():
            BATCH_TMP_PATH.unlink()


def ensure_mapping(config: dict[str, Any], remote_titles: list[str]) -> dict[str, str]:
    sheet_map: dict[str, str] = config.setdefault("sheet_map", {})
    used = set(sheet_map.values())
    for title in remote_titles:
        if title not in sheet_map:
            fname = sanitize_filename(title, used)
            sheet_map[title] = fname
            used.add(fname)
    return sheet_map


def cmd_pull(config: dict[str, Any]) -> None:
    spreadsheet_id = config["spreadsheet_id"]
    sheets_dir = BASE_DIR / config.get("sheets_dir", "sheets")
    sheets_dir.mkdir(parents=True, exist_ok=True)

    print("Đang tải toàn bộ sheet từ Google Sheets (giữ nguyên công thức)...")
    _, remote_grids = fetch_remote_sheets(spreadsheet_id)
    sheet_map = ensure_mapping(config, list(remote_grids.keys()))

    for title, grid in remote_grids.items():
        fpath = sheets_dir / sheet_map[title]
        write_local_csv(fpath, grid)
        non_empty = sum(1 for r in grid if any(c != "" for c in r))
        print(f"  [PULL] {title!r} -> sheets/{sheet_map[title]} ({non_empty} dòng có dữ liệu)")

    save_json(CONFIG_PATH, config)
    save_json(
        STATE_PATH,
        {
            "last_sync_utc": datetime.now(timezone.utc).isoformat(),
            "spreadsheet_id": spreadsheet_id,
            "sheets": remote_grids,
        },
    )
    if CONFLICTS_PATH.exists():
        CONFLICTS_PATH.unlink()
    print(f"\nHoàn tất! Đã tải {len(remote_grids)} sheet về thư mục: {sheets_dir}")


def compute_sync_plan(
    config: dict[str, Any],
    state: dict[str, Any],
    remote_grids: dict[str, list[list[str]]],
    on_conflict: str,
    push_only: bool = False,
) -> dict[str, Any]:
    sheets_dir = BASE_DIR / config.get("sheets_dir", "sheets")
    sheet_map: dict[str, str] = dict(config.get("sheet_map", {}))
    base_sheets: dict[str, list[list[str]]] = state.get("sheets", {})

    used_names = set(sheet_map.values())
    plan: dict[str, Any] = {
        "new_remote_sheets": [],
        "new_local_files": [],
        "missing_local_files": [],
        "missing_remote_sheets": [],
        "push_cells": {},  # title -> {(r, c): val}
        "pull_cells": {},  # title -> {(r, c): val}
        "merged_grids": {},  # title -> 2D list
        "conflicts": [],
        "warnings": [],
        "sheet_map": sheet_map,
    }

    # 1. Detect new remote sheets
    for title in remote_grids:
        if title not in sheet_map:
            fname = sanitize_filename(title, used_names)
            sheet_map[title] = fname
            used_names.add(fname)
            plan["new_remote_sheets"].append((title, fname))
            plan["merged_grids"][title] = remote_grids[title]

    # 2. Check mapped sheets
    mapped_files_lower = {v.lower() for v in sheet_map.values()}
    for title, fname in list(sheet_map.items()):
        if any(t == title for t, _ in plan["new_remote_sheets"]):
            continue
        fpath = sheets_dir / fname
        in_remote = title in remote_grids
        in_local = fpath.exists()

        if not in_remote and in_local:
            plan["missing_remote_sheets"].append((title, fname))
            continue
        if in_remote and not in_local:
            plan["missing_local_files"].append((title, fname))
            continue
        if not in_remote and not in_local:
            continue

        base = normalize_grid(base_sheets.get(title, []))
        local = read_local_csv(fpath)
        remote = remote_grids[title]

        max_rows = max(len(base), len(local), len(remote))
        merged = [list(r) for r in remote]
        push_map: dict[tuple[int, int], str] = {}
        pull_map: dict[tuple[int, int], str] = {}

        for r in range(max_rows):
            max_cols = max(
                len(base[r]) if r < len(base) else 0,
                len(local[r]) if r < len(local) else 0,
                len(remote[r]) if r < len(remote) else 0,
            )
            for c in range(max_cols):
                b = get_cell(base, r, c)
                l = get_cell(local, r, c)
                rem = get_cell(remote, r, c)

                if l == rem:
                    set_cell(merged, r, c, l)
                elif l != b and rem == b:
                    # Guard against Excel corrupting a Google Sheets formula
                    if b.startswith("=") and l in EXCEL_ERROR_TOKENS:
                        plan["warnings"].append(
                            f"Bỏ qua ô {cell_ref(title, r, c)}: phát hiện công thức '{b}' "
                            f"bị Excel đổi thành lỗi '{l}'. Giữ nguyên công thức gốc."
                        )
                        set_cell(merged, r, c, rem)
                        pull_map[(r, c)] = rem
                    else:
                        push_map[(r, c)] = l
                        set_cell(merged, r, c, l)
                elif l == b and rem != b:
                    if not push_only:
                        pull_map[(r, c)] = rem
                        set_cell(merged, r, c, rem)
                    else:
                        set_cell(merged, r, c, rem)
                else:
                    # Both sides changed the same cell differently
                    if on_conflict == "local":
                        push_map[(r, c)] = l
                        set_cell(merged, r, c, l)
                    elif on_conflict == "remote":
                        pull_map[(r, c)] = rem
                        set_cell(merged, r, c, rem)
                    else:
                        plan["conflicts"].append(
                            {
                                "sheet": title,
                                "cell": f"{col_to_letters(c)}{r + 1}",
                                "base": b,
                                "local": l,
                                "remote": rem,
                            }
                        )

        if push_map:
            plan["push_cells"][title] = push_map
        if pull_map:
            plan["pull_cells"][title] = pull_map
        plan["merged_grids"][title] = normalize_grid(merged)

    # 3. Detect brand new local CSV files
    if sheets_dir.exists():
        for csv_path in sorted(sheets_dir.glob("*.csv")):
            if csv_path.name.lower() not in mapped_files_lower:
                new_title = csv_path.stem
                if new_title not in remote_grids:
                    plan["new_local_files"].append((new_title, csv_path.name))

    return plan


def print_plan(plan: dict[str, Any]) -> None:
    total_push = sum(len(v) for v in plan["push_cells"].values())
    total_pull = sum(len(v) for v in plan["pull_cells"].values())

    print("=== TÓM TẮT ĐỒNG BỘ ===")
    print(f"- Ô thay đổi ở máy (sẽ đẩy lên Web): {total_push}")
    for title, cells in plan["push_cells"].items():
        sample = ", ".join(f"{col_to_letters(c)}{r + 1}" for (r, c) in list(cells.keys())[:6])
        more = f" (+{len(cells) - 6} ô)" if len(cells) > 6 else ""
        print(f"    ↑ {title}: {len(cells)} ô [{sample}{more}]")

    print(f"- Ô thay đổi trên Web (sẽ kéo về máy): {total_pull}")
    for title, cells in plan["pull_cells"].items():
        sample = ", ".join(f"{col_to_letters(c)}{r + 1}" for (r, c) in list(cells.keys())[:6])
        more = f" (+{len(cells) - 6} ô)" if len(cells) > 6 else ""
        print(f"    ↓ {title}: {len(cells)} ô [{sample}{more}]")

    if plan["new_remote_sheets"]:
        print("- Sheet mới trên Web (sẽ tạo file local):")
        for title, fname in plan["new_remote_sheets"]:
            print(f"    + {title!r} -> sheets/{fname}")

    if plan["new_local_files"]:
        print("- File CSV mới ở máy (sẽ tạo tab mới trên Web):")
        for title, fname in plan["new_local_files"]:
            print(f"    + sheets/{fname} -> tab {title!r}")

    if plan["missing_local_files"]:
        print("- CẢNH BÁO - File bị thiếu ở máy (KHÔNG tự xóa trên Web):")
        for title, fname in plan["missing_local_files"]:
            print(f"    ! {title!r} (thiếu sheets/{fname}) -> chạy `pull` để khôi phục nếu cần")

    if plan["missing_remote_sheets"]:
        print("- CẢNH BÁO - Tab không còn trên Web (KHÔNG tự xóa file ở máy):")
        for title, fname in plan["missing_remote_sheets"]:
            print(f"    ! sheets/{fname} (không thấy tab {title!r} trên Web)")

    for w in plan["warnings"]:
        print(f"- CẢNH BÁO: {w}")

    if plan["conflicts"]:
        print(f"- XUNG ĐỘT ({len(plan['conflicts'])} ô bị sửa cùng lúc ở cả máy và Web):")
        for c in plan["conflicts"][:15]:
            print(
                f"    ⚠ {c['sheet']}!{c['cell']} | "
                f"Gốc: {c['base']!r} | Máy: {c['local']!r} | Web: {c['remote']!r}"
            )
        if len(plan["conflicts"]) > 15:
            print(f"    ... và {len(plan['conflicts']) - 15} xung đột khác (xem .sync/conflicts.json)")


def cmd_sync(
    config: dict[str, Any],
    dry_run: bool = False,
    on_conflict: str = "ask",
    push_only: bool = False,
) -> int:
    state = load_json(STATE_PATH)
    if not state:
        print("Chưa có snapshot đồng bộ ban đầu. Vui lòng chạy `python sync.py pull` trước.")
        return 1

    spreadsheet_id = config["spreadsheet_id"]
    sheets_dir = BASE_DIR / config.get("sheets_dir", "sheets")

    print("Đang kiểm tra thay đổi giữa thư mục máy và Google Sheets...")
    _, remote_grids = fetch_remote_sheets(spreadsheet_id)
    plan = compute_sync_plan(config, state, remote_grids, on_conflict=on_conflict, push_only=push_only)
    print_plan(plan)

    if plan["conflicts"]:
        save_json(CONFLICTS_PATH, plan["conflicts"])
        print(
            "\nĐã dừng để bảo vệ dữ liệu vì có xung đột. "
            "Chạy lại với `--on-conflict local` (ưu tiên máy) hoặc "
            "`--on-conflict remote` (ưu tiên Web) sau khi quyết định."
        )
        return 2

    if dry_run:
        print("\n[DRY-RUN] Chưa ghi bất kỳ thay đổi nào.")
        return 0

    anything_changed = (
        bool(plan["push_cells"])
        or bool(plan["pull_cells"])
        or bool(plan["new_remote_sheets"])
        or bool(plan["new_local_files"])
    )
    if not anything_changed:
        print("\nMọi dữ liệu đã đồng bộ, không có thay đổi mới.")
        return 0

    # 1. Push cell-level changes to Google Sheets
    all_ops: list[dict[str, Any]] = []
    for title, changes in plan["push_cells"].items():
        all_ops.extend(build_batch_ops(title, changes))
    if all_ops:
        print(f"\nĐang đẩy {len(all_ops)} nhóm cập nhật lên Google Sheets...")
        execute_batch_ops(spreadsheet_id, all_ops)

    # 2. Create new tabs for brand new local CSV files
    sheet_map = plan["sheet_map"]
    for title, fname in plan["new_local_files"]:
        print(f"Đang tạo tab mới trên Google Sheets: {title!r}...")
        run_gsheets(["mutate", "add-sheet", spreadsheet_id, "--title", title])
        local_grid = read_local_csv(sheets_dir / fname)
        if local_grid:
            new_changes = {
                (r, c): val
                for r, row in enumerate(local_grid)
                for c, val in enumerate(row)
                if val != ""
            }
            ops = build_batch_ops(title, new_changes)
            execute_batch_ops(spreadsheet_id, ops)
        sheet_map[title] = fname
        plan["merged_grids"][title] = local_grid

    # 3. Write updated / newly pulled CSV files locally
    if not push_only:
        pulled_titles = list(plan["pull_cells"].keys()) + [t for t, _ in plan["new_remote_sheets"]]
        for title in pulled_titles:
            fpath = sheets_dir / sheet_map[title]
            write_local_csv(fpath, plan["merged_grids"][title])
        if any(t.strip() in TASK1_IMAGE_SHEETS for t in pulled_titles):
            extract_task1_images(spreadsheet_id)

    # 4. Save updated config & state snapshot
    config["sheet_map"] = sheet_map
    save_json(CONFIG_PATH, config)

    new_state_sheets = dict(state.get("sheets", {}))
    for title, grid in plan["merged_grids"].items():
        new_state_sheets[title] = grid
    save_json(
        STATE_PATH,
        {
            "last_sync_utc": datetime.now(timezone.utc).isoformat(),
            "spreadsheet_id": spreadsheet_id,
            "sheets": new_state_sheets,
        },
    )
    if CONFLICTS_PATH.exists():
        CONFLICTS_PATH.unlink()

    print("\nĐồng bộ 2 chiều hoàn tất!")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Đồng bộ 2 chiều Google Sheets <-> thư mục CSV")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("pull", help="Tải toàn bộ dữ liệu từ Google Sheets về máy (ghi đè local)")
    sub.add_parser("status", help="Xem khác biệt giữa máy và Google Sheets (không ghi)")
    sub.add_parser("extract-images", help="Trích xuất ảnh dán trực tiếp từ các tab IELTS Task 1")

    p_sync = sub.add_parser("sync", help="Đồng bộ 2 chiều theo từng ô (3-way merge)")
    p_sync.add_argument("--dry-run", action="store_true", help="Chỉ xem trước, không ghi")
    p_sync.add_argument(
        "--on-conflict",
        choices=("ask", "local", "remote"),
        default="ask",
        help="Cách xử lý khi cùng 1 ô bị sửa ở cả 2 bên (mặc định: ask)",
    )

    p_push = sub.add_parser("push", help="Chỉ đẩy thay đổi từ máy lên Google Sheets")
    p_push.add_argument("--dry-run", action="store_true", help="Chỉ xem trước, không ghi")
    p_push.add_argument(
        "--on-conflict",
        choices=("ask", "local", "remote"),
        default="ask",
        help="Cách xử lý xung đột",
    )

    args = parser.parse_args()
    config = load_json(CONFIG_PATH)
    if not config:
        print(f"Không tìm thấy file cấu hình tại {CONFIG_PATH}")
        return 1

    if args.command == "pull":
        cmd_pull(config)
        extract_task1_images(config["spreadsheet_id"])
        return 0
    if args.command == "extract-images":
        extract_task1_images(config["spreadsheet_id"])
        return 0
    if args.command == "status":
        return cmd_sync(config, dry_run=True, on_conflict="ask")
    if args.command == "sync":
        return cmd_sync(config, dry_run=args.dry_run, on_conflict=args.on_conflict)
    if args.command == "push":
        return cmd_sync(
            config, dry_run=args.dry_run, on_conflict=args.on_conflict, push_only=True
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
