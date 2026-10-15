#!/usr/bin/env python3
"""Extract Age-update tables from PDF cell boundaries; never match specific race names."""
import json
import re
import sys
import pdfplumber


def cell(value):
    return re.sub(r"[ \t]+", " ", str(value or "")).strip()


def lines(value):
    return [cell(x) for x in str(value or "").replace("\r", "").split("\n") if cell(x)]


def bullet_lines(value):
    result = []
    starts = re.compile(
        r"^(?:[+\-−]\s*\d|\d+%\s|immune\b|can\b|no\b|access\b|all\b|incite\b|train\b|gain\b|"
        r"offensive\s+specialist|elite\s+gets|successful\s+|operations\b)",
        re.I,
    )
    for item in lines(value):
        if not result or starts.match(item):
            result.append(item)
        else:
            result[-1] += " " + item
    return result


def spells(value):
    source_lines = lines(value)
    if not source_lines:
        return []
    if any("," in line for line in source_lines):
        parts = re.split(r"[,;]", " ".join(source_lines))
    else:
        parts = source_lines
    return [cell(x).rstrip(",; ") for x in parts if cell(x).rstrip(",; ")]


def parse_pdf(path):
    result = {"races": [], "personalities": [], "rituals": [], "dragons": [], "tables_found": 0}
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                if not table:
                    continue
                kind = None
                header_index = None
                for i, row in enumerate(table):
                    normalized = [cell(x).lower() for x in row]
                    if len(normalized) >= 6 and normalized[0] == "race" and normalized[1] == "archetype" and "bonuses" in normalized[2]:
                        kind, header_index = "races", i
                        break
                    if len(normalized) >= 6 and normalized[0] == "personality" and normalized[1] == "archetype" and "bonuses" in normalized[2]:
                        kind, header_index = "personalities", i
                        break
                    if len(normalized) >= 2 and normalized[0] == "ritual" and normalized[1] == "effect":
                        kind, header_index = "rituals", i
                        break
                    if len(normalized) >= 2 and normalized[0] in ("dragon", "dragons") and normalized[1] == "effect":
                        kind, header_index = "dragons", i
                        break
                if not kind:
                    continue
                result["tables_found"] += 1
                for row in table[header_index + 1:]:
                    if not row:
                        continue
                    name = cell(row[0] if row else "")
                    if not name or name.lower() in {"race", "personality", "ritual", "dragon", "dragons"}:
                        continue
                    if kind == "races":
                        if len(row) < 15:
                            raise ValueError(f"Race table row '{name}' has {len(row)} columns; expected at least 15")
                        elite = [cell(row[i]) for i in (8, 9, 10, 11)]
                        elite_text = f"{elite[0]}/{elite[1]} ({elite[2]}gc, {elite[3]}nw)" if all(elite) else ""
                        ospec, dspec, horse = cell(row[6]), cell(row[7]), cell(row[12])
                        units = " · ".join(x for x in [
                            "Soldier 3/0",
                            f"Off Spec {ospec}/0 ({float(ospec) * 0.4:g}nw)" if ospec else "",
                            f"Def Spec 0/{dspec} ({float(dspec) * 0.5:g}nw)" if dspec else "",
                            f"Elite {elite_text}" if elite_text else "",
                            "Merc 8/0",
                            "Prisoner 8/0",
                            f"War Horse {horse}/0 (0.6nw)" if horse and horse.lower() not in {"n/a", "na", "-"} else "War Horse n/a",
                        ] if x)
                        result[kind].append({
                            "name": name,
                            "archetype": cell(row[1]),
                            "bonuses": bullet_lines(row[2]),
                            "penalties": bullet_lines(row[3]),
                            "spells": spells(row[4]),
                            "doctrine": re.sub(r"\s+", " ", cell(row[5])),
                            "units": units,
                            "unique_name": cell(row[13]),
                            "unique_passive": re.sub(r"\s+", " ", cell(row[14])),
                        })
                    elif kind == "personalities":
                        if len(row) < 7:
                            raise ValueError(f"Personality table row '{name}' has {len(row)} columns; expected at least 7")
                        result[kind].append({
                            "name": name,
                            "archetype": cell(row[1]),
                            "bonuses": bullet_lines(row[2]),
                            "spells": spells(row[3]),
                            "starts_with": lines(row[4]),
                            "unique_name": cell(row[5]),
                            "unique_passive": re.sub(r"\s+", " ", cell(row[6])),
                        })
                    else:
                        effect = cell(row[1] if len(row) > 1 else "")
                        if effect:
                            result[kind].append({"name": name, "effects": [re.sub(r"\s+", " ", effect)]})
    if len(result["races"]) < 10:
        raise ValueError(f"Race table extraction incomplete: {len(result['races'])} rows")
    if len(result["personalities"]) < 5:
        raise ValueError(f"Personality table extraction incomplete: {len(result['personalities'])} rows")
    if not result["rituals"] or not result["dragons"]:
        raise ValueError("Ritual or dragon table missing")
    return result


if __name__ == "__main__":
    try:
        print(json.dumps(parse_pdf(sys.argv[1]), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(2)
