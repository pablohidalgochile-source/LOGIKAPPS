#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NANOOKEY LOCAL SCANNER
Escanea carpetas de música autorizadas por el usuario, cruza contra la importación Serato
previamente generada y produce CSV/JSON para alimentar NANOOKEY.

No descarga música. No automatiza ARL. Solo lee archivos locales, metadata y rutas.

Uso rápido:
  python3 nanookey_local_scanner.py \
    --serato-import /ruta/NANOOKEY_import_serato_resultados.zip \
    --scan-root "/Volumes/DISCO_DJ" \
    --scan-root "$HOME/Music" \
    --output "$HOME/Desktop/NANOOKEY_SCAN_RESULT"

Opcional, para leer metadata ID3/MP4/FLAC con más detalle:
  python3 -m pip install mutagen
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".wave", ".flac", ".m4a", ".aac", ".aif", ".aiff", ".ogg", ".opus", ".wma"
}

# Intentamos usar mutagen si existe. El script funciona igual sin mutagen.
try:
    from mutagen import File as MutagenFile  # type: ignore
except Exception:  # pragma: no cover
    MutagenFile = None


def norm_path(value: str) -> str:
    """Normaliza rutas para matching robusto entre Serato y macOS."""
    if value is None:
        return ""
    value = str(value).replace("\\", "/")
    value = re.sub(r"/+/", "/", value)
    value = value.strip().strip("\ufeff")
    return value.lower()


def norm_name(value: str) -> str:
    """Normaliza títulos/filenames para comparación suave."""
    if value is None:
        return ""
    value = value.lower()
    value = re.sub(r"\.[a-z0-9]{2,5}$", "", value)
    value = value.replace("_", " ").replace("-", " ").replace("+", " ")
    value = re.sub(r"\b(official|video|audio|lyrics|lyric|hd|hq|mp3|wav|flac)\b", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def safe_read_csv(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return [{k: (v if v is not None else "") for k, v in row.items()} for row in reader]


def safe_write_csv(path: Path, rows: List[Dict], fieldnames: Optional[List[str]] = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if fieldnames is None:
        keys = []
        seen = set()
        for row in rows:
            for k in row.keys():
                if k not in seen:
                    seen.add(k)
                    keys.append(k)
        fieldnames = keys
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def extract_serato_import(serato_import: Path, workdir: Path) -> Path:
    """Acepta ZIP o carpeta. Devuelve carpeta con CSVs extraídos."""
    if not serato_import.exists():
        raise FileNotFoundError(f"No existe: {serato_import}")

    if serato_import.is_dir():
        return serato_import

    if serato_import.suffix.lower() == ".zip":
        target = workdir / "serato_import_extracted"
        target.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(serato_import, "r") as zf:
            zf.extractall(target)
        return target

    raise ValueError("--serato-import debe ser una carpeta o un .zip")


@dataclass
class LocalAudioFile:
    local_path: str
    filename: str
    extension: str
    parent_folder: str
    size_bytes: int
    modified_time: str
    duration_seconds: str = ""
    bitrate: str = ""
    sample_rate: str = ""
    channels: str = ""
    meta_title: str = ""
    meta_artist: str = ""
    meta_album: str = ""
    meta_genre: str = ""
    meta_year: str = ""
    meta_bpm: str = ""
    meta_key: str = ""
    meta_comment: str = ""
    content_hash_quick: str = ""


def get_first_tag(tags, keys: Iterable[str]) -> str:
    if not tags:
        return ""
    for key in keys:
        try:
            if key in tags:
                value = tags[key]
                # mutagen puede devolver listas, frames ID3 o valores simples.
                if isinstance(value, list) and value:
                    value = value[0]
                if hasattr(value, "text") and value.text:
                    return str(value.text[0])
                return str(value)
        except Exception:
            continue
    return ""


def scan_metadata(path: Path) -> Dict[str, str]:
    meta = {
        "duration_seconds": "",
        "bitrate": "",
        "sample_rate": "",
        "channels": "",
        "meta_title": "",
        "meta_artist": "",
        "meta_album": "",
        "meta_genre": "",
        "meta_year": "",
        "meta_bpm": "",
        "meta_key": "",
        "meta_comment": "",
    }
    if MutagenFile is None:
        return meta

    try:
        audio = MutagenFile(str(path), easy=False)
        if audio is None:
            return meta
        info = getattr(audio, "info", None)
        if info is not None:
            length = getattr(info, "length", None)
            if length is not None:
                meta["duration_seconds"] = f"{float(length):.2f}"
            bitrate = getattr(info, "bitrate", None)
            if bitrate:
                meta["bitrate"] = str(int(bitrate))
            sample_rate = getattr(info, "sample_rate", None)
            if sample_rate:
                meta["sample_rate"] = str(sample_rate)
            channels = getattr(info, "channels", None)
            if channels:
                meta["channels"] = str(channels)

        tags = getattr(audio, "tags", None)
        # ID3 + MP4 + FLAC comunes. Mixed In Key suele escribir TBPM/TKEY/INITIALKEY o comments.
        meta["meta_title"] = get_first_tag(tags, ["TIT2", "title", "\xa9nam"])
        meta["meta_artist"] = get_first_tag(tags, ["TPE1", "artist", "\xa9ART"])
        meta["meta_album"] = get_first_tag(tags, ["TALB", "album", "\xa9alb"])
        meta["meta_genre"] = get_first_tag(tags, ["TCON", "genre", "\xa9gen"])
        meta["meta_year"] = get_first_tag(tags, ["TDRC", "TYER", "date", "year", "\xa9day"])
        meta["meta_bpm"] = get_first_tag(tags, ["TBPM", "bpm", "tmpo"])
        meta["meta_key"] = get_first_tag(tags, [
            "TKEY", "initialkey", "INITIALKEY", "key",
            "----:com.apple.iTunes:initialkey", "----:com.apple.iTunes:INITIALKEY",
            "----:com.apple.iTunes:KEY", "----:com.apple.iTunes:Key"
        ])
        meta["meta_comment"] = get_first_tag(tags, ["COMM::eng", "COMM", "comment", "\xa9cmt"])
    except Exception:
        return meta

    # Limpieza básica de bytes de MP4 freeform.
    for k, v in list(meta.items()):
        if isinstance(v, str):
            meta[k] = v.replace("b'", "").replace("'", "").strip()
    return meta


def quick_hash(path: Path, max_bytes: int = 1024 * 1024) -> str:
    """Hash rápido parcial: suficiente para detectar duplicados probables sin leer archivos enormes completos."""
    try:
        h = hashlib.sha1()
        with path.open("rb") as f:
            h.update(f.read(max_bytes))
        return h.hexdigest()
    except Exception:
        return ""


def scan_roots(roots: List[Path], hash_files: bool = False) -> List[LocalAudioFile]:
    rows: List[LocalAudioFile] = []
    seen_paths = set()
    for root in roots:
        root = root.expanduser()
        if not root.exists():
            print(f"⚠️  No existe carpeta, se omite: {root}")
            continue
        print(f"🔎 Escaneando: {root}")
        for current_root, dirs, files in os.walk(root):
            # Evitar basura pesada o paquetes de apps.
            dirs[:] = [d for d in dirs if d not in {".Spotlight-V100", ".Trashes", "System Volume Information", "node_modules", ".git"}]
            for filename in files:
                ext = Path(filename).suffix.lower()
                if ext not in AUDIO_EXTENSIONS:
                    continue
                p = Path(current_root) / filename
                p_str = str(p)
                if p_str in seen_paths:
                    continue
                seen_paths.add(p_str)
                try:
                    stat = p.stat()
                    modified = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
                    meta = scan_metadata(p)
                    row = LocalAudioFile(
                        local_path=p_str,
                        filename=filename,
                        extension=ext,
                        parent_folder=str(p.parent),
                        size_bytes=stat.st_size,
                        modified_time=modified,
                        content_hash_quick=quick_hash(p) if hash_files else "",
                        **meta,
                    )
                    rows.append(row)
                except Exception as e:
                    print(f"⚠️  No se pudo leer: {p} — {e}")
    return rows


def build_indexes(local_rows: List[Dict]) -> Tuple[Dict[str, List[Dict]], Dict[str, List[Dict]], Dict[str, Dict]]:
    by_filename = defaultdict(list)
    by_norm_filename = defaultdict(list)
    by_norm_path = {}
    for row in local_rows:
        filename = row.get("filename", "")
        local_path = row.get("local_path", "")
        by_filename[filename.lower()].append(row)
        by_norm_filename[norm_name(filename)].append(row)
        by_norm_path[norm_path(local_path)] = row
    return by_filename, by_norm_filename, by_norm_path


def match_serato_to_local(serato_rows: List[Dict], local_rows: List[Dict]) -> List[Dict]:
    by_filename, by_norm_filename, by_norm_path = build_indexes(local_rows)
    results: List[Dict] = []

    # Para exact suffix match, recorrer local paths puede ser costoso, pero 30k x 30k aún puede pesar.
    # Optimizamos por filename primero y luego confirmamos suffix entre candidatos.
    for s in serato_rows:
        serato_path = s.get("track_path", "")
        filename = s.get("filename", "") or Path(serato_path).name
        serato_norm = norm_path(serato_path)
        candidates = by_filename.get(filename.lower(), [])
        match_status = "missing"
        match_confidence = 0
        match_reason = "No encontrado por filename/ruta"
        local_match = None
        candidate_count = len(candidates)

        # 1) Ruta local termina igual que la ruta de Serato.
        suffix_candidates = []
        for c in candidates:
            local_norm = norm_path(c.get("local_path", ""))
            if local_norm.endswith(serato_norm):
                suffix_candidates.append(c)
        if len(suffix_candidates) == 1:
            local_match = suffix_candidates[0]
            match_status = "perfect"
            match_confidence = 100
            match_reason = "Ruta local termina igual que ruta Serato"
        elif len(suffix_candidates) > 1:
            local_match = suffix_candidates[0]
            match_status = "duplicate"
            match_confidence = 92
            match_reason = "Múltiples archivos con misma ruta final"
        elif len(candidates) == 1:
            local_match = candidates[0]
            match_status = "probable"
            match_confidence = 82
            match_reason = "Filename único encontrado"
        elif len(candidates) > 1:
            # Elegir el candidato cuyo path se parece más por tokens.
            serato_tokens = set(norm_name(serato_path).split())
            best = None
            best_score = -1
            for c in candidates:
                c_tokens = set(norm_name(c.get("local_path", "")).split())
                score = len(serato_tokens & c_tokens)
                if score > best_score:
                    best = c
                    best_score = score
            local_match = best
            match_status = "duplicate"
            match_confidence = min(78, 45 + best_score * 3)
            match_reason = f"Filename repetido; mejor candidato por tokens ({candidate_count} candidatos)"
        else:
            # 2) Normalización suave de filename.
            soft = by_norm_filename.get(norm_name(filename), [])
            candidate_count = len(soft)
            if len(soft) == 1:
                local_match = soft[0]
                match_status = "doubt"
                match_confidence = 65
                match_reason = "Coincidencia suave por nombre normalizado"
            elif len(soft) > 1:
                local_match = soft[0]
                match_status = "doubt"
                match_confidence = 55
                match_reason = f"Varias coincidencias suaves ({candidate_count} candidatos)"

        out = dict(s)
        out.update({
            "match_status": match_status,
            "match_confidence": match_confidence,
            "match_reason": match_reason,
            "local_candidate_count": candidate_count,
        })
        if local_match:
            for k, v in local_match.items():
                out[f"local_{k}"] = v
        else:
            for k in [
                "local_path", "filename", "extension", "parent_folder", "size_bytes", "modified_time",
                "duration_seconds", "bitrate", "sample_rate", "channels", "meta_title", "meta_artist",
                "meta_album", "meta_genre", "meta_year", "meta_bpm", "meta_key", "meta_comment", "content_hash_quick"
            ]:
                out[f"local_{k}"] = ""
        results.append(out)
    return results


def load_serato_unique(import_folder: Path) -> List[Dict[str, str]]:
    candidates = [
        import_folder / "nanookey_unique_tracks_main.csv",
        import_folder / "nanookey_unique_tracks.csv",
    ]
    for p in candidates:
        if p.exists():
            return safe_read_csv(p)
    raise FileNotFoundError("No encontré nanookey_unique_tracks_main.csv dentro de la importación Serato")


def load_serato_crates_summary(import_folder: Path) -> List[Dict[str, str]]:
    p = import_folder / "nanookey_crates_summary.csv"
    return safe_read_csv(p) if p.exists() else []


def write_source_template(output: Path) -> None:
    rows = [
        {
            "source_name": "Playlist Deezer ejemplo",
            "source_type": "deezer_playlist_link",
            "url_or_path": "https://www.deezer.com/playlist/0000000000",
            "status": "pending_copy_or_manual_export",
            "notes": "Pega aquí links legales o exportaciones CSV/M3U para matching. NANOOKEY no descarga automáticamente.",
        },
        {
            "source_name": "Soundiiz CSV ejemplo",
            "source_type": "csv_export",
            "url_or_path": "/ruta/a/soundiiz_playlist.csv",
            "status": "ready_to_import",
            "notes": "Exportar desde Soundiiz y luego importar en NANOOKEY.",
        },
        {
            "source_name": "Carpeta local para revisar",
            "source_type": "local_folder",
            "url_or_path": "/Volumes/DISCO_DJ/Downloads/Revisar",
            "status": "watch_or_scan_manually",
            "notes": "Carpeta autorizada por el usuario para escaneo local.",
        },
    ]
    safe_write_csv(output / "nanookey_sources_queue_template.csv", rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="NANOOKEY Local Scanner")
    parser.add_argument("--serato-import", required=True, help="ZIP o carpeta con resultados de importación Serato")
    parser.add_argument("--scan-root", action="append", required=True, help="Carpeta/disco a escanear. Se puede repetir.")
    parser.add_argument("--output", required=True, help="Carpeta de salida")
    parser.add_argument("--hash-files", action="store_true", help="Calcula hash parcial de audio para duplicados probables. Puede tardar más.")
    args = parser.parse_args()

    output = Path(args.output).expanduser()
    output.mkdir(parents=True, exist_ok=True)
    workdir = output / "_work"
    workdir.mkdir(exist_ok=True)

    started = time.time()
    print("🎧 NANOOKEY LOCAL SCANNER")
    print("No descarga música. Solo lee archivos locales y cruza metadata.")

    serato_folder = extract_serato_import(Path(args.serato_import).expanduser(), workdir)
    serato_unique = load_serato_unique(serato_folder)
    crates_summary = load_serato_crates_summary(serato_folder)
    print(f"✅ Rutas únicas Serato cargadas: {len(serato_unique):,}")

    roots = [Path(x).expanduser() for x in args.scan_root]
    local_files = [asdict(x) for x in scan_roots(roots, hash_files=args.hash_files)]
    print(f"✅ Archivos de audio locales detectados: {len(local_files):,}")

    print("🔗 Cruzando Serato ↔ archivos locales...")
    master = match_serato_to_local(serato_unique, local_files)

    # Resúmenes
    status_counts = Counter(row.get("match_status", "") for row in master)
    ext_counts = Counter(row.get("extension", "") for row in serato_unique)
    local_ext_counts = Counter(row.get("extension", "") for row in local_files)

    missing = [r for r in master if r.get("match_status") == "missing"]
    needs_review = [r for r in master if r.get("match_status") in {"doubt", "duplicate"}]

    # Duplicados por filename local
    filename_groups = defaultdict(list)
    for row in local_files:
        filename_groups[row.get("filename", "").lower()].append(row)
    duplicate_rows = []
    for fname, rows in filename_groups.items():
        if fname and len(rows) > 1:
            duplicate_rows.append({
                "filename": rows[0].get("filename", ""),
                "duplicate_count": len(rows),
                "paths": " || ".join(r.get("local_path", "") for r in rows[:20]),
                "total_size_bytes": sum(int(r.get("size_bytes") or 0) for r in rows),
            })
    duplicate_rows.sort(key=lambda r: int(r["duplicate_count"]), reverse=True)

    # Escritura
    safe_write_csv(output / "nanookey_local_files.csv", local_files)
    safe_write_csv(output / "nanookey_library_master.csv", master)
    safe_write_csv(output / "nanookey_missing_from_disk.csv", missing)
    safe_write_csv(output / "nanookey_needs_review.csv", needs_review)
    safe_write_csv(output / "nanookey_duplicates_by_filename.csv", duplicate_rows)
    if crates_summary:
        safe_write_csv(output / "nanookey_crates_summary_copy.csv", crates_summary)
    write_source_template(output)

    summary = {
        "scanner_version": "0.1.0",
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "elapsed_seconds": round(time.time() - started, 2),
        "serato_unique_tracks": len(serato_unique),
        "local_audio_files_detected": len(local_files),
        "match_status_counts": dict(status_counts),
        "serato_extension_counts": dict(ext_counts),
        "local_extension_counts": dict(local_ext_counts),
        "duplicates_by_filename": len(duplicate_rows),
        "scan_roots": [str(r) for r in roots],
        "mutagen_available": MutagenFile is not None,
        "outputs": [
            "nanookey_local_files.csv",
            "nanookey_library_master.csv",
            "nanookey_missing_from_disk.csv",
            "nanookey_needs_review.csv",
            "nanookey_duplicates_by_filename.csv",
            "nanookey_sources_queue_template.csv",
            "nanookey_scan_summary.json",
        ],
    }
    with (output / "nanookey_scan_summary.json").open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    # Informe Markdown breve
    md = f"""# NANOOKEY — Informe de Scanner Local

## Resultado

- Rutas únicas Serato cargadas: **{len(serato_unique):,}**
- Archivos de audio locales detectados: **{len(local_files):,}**
- Mutagen disponible para metadata: **{MutagenFile is not None}**
- Tiempo de escaneo: **{summary['elapsed_seconds']} segundos**

## Matching

"""
    for status, count in status_counts.most_common():
        md += f"- {status}: **{count:,}**\n"
    md += """
## Archivos generados

- `nanookey_library_master.csv`: base maestra para NANOOKEY.
- `nanookey_local_files.csv`: todos los audios locales escaneados.
- `nanookey_missing_from_disk.csv`: rutas de Serato que no se encontraron físicamente.
- `nanookey_needs_review.csv`: matches dudosos o duplicados.
- `nanookey_duplicates_by_filename.csv`: posibles duplicados por nombre.
- `nanookey_sources_queue_template.csv`: plantilla para links de Deezer/Spotify/Soundiiz/CSV/rutas locales.
- `nanookey_scan_summary.json`: resumen técnico para backend.

## Nota

Este scanner no descarga música ni automatiza credenciales externas. Solo analiza carpetas locales autorizadas por el usuario.
"""
    (output / "NANOOKEY_informe_scanner_local.md").write_text(md, encoding="utf-8")

    print("\n✅ Listo. Archivos generados en:")
    print(output)
    print("\nResumen matching:")
    for status, count in status_counts.most_common():
        print(f"  {status}: {count:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
