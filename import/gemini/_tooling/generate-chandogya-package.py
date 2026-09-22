#!/usr/bin/env python3
"""Normalize and validate the Chandogya package copied into _scratch."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TXT_PATH = ROOT / "import" / "gemini" / "_scratch" / "chandogya.txt"
OUT_PATH = ROOT / "import" / "gemini" / "incoming" / "chandogya-upanishad.json"


def normalize_wrapped_json(text: str) -> str:
    """Join visual line wraps occurring inside JSON string values."""
    result: list[str] = []
    in_string = False
    string_is_key = False
    escaped = False
    index = 0
    while index < len(text):
        char = text[index]
        if in_string:
            if escaped:
                result.append(char)
                escaped = False
            elif char == "\\":
                result.append(char)
                escaped = True
            elif char == '"':
                lookahead = index + 1
                while lookahead < len(text) and text[lookahead] in " \t\r\n":
                    lookahead += 1
                closes_value = lookahead == len(text) or text[lookahead] in "]}"
                if string_is_key and lookahead < len(text) and text[lookahead] == ":":
                    closes_value = True
                if lookahead < len(text) and text[lookahead] == ",":
                    after_comma = lookahead + 1
                    while after_comma < len(text) and text[after_comma] in " \t\r\n":
                        after_comma += 1
                    closes_value = after_comma < len(text) and text[after_comma] in "{[\""
                if closes_value:
                    result.append(char)
                    in_string = False
                else:
                    result.extend(("\\", '"'))
            elif char in "\r\n":
                if not result or result[-1] != " ":
                    result.append(" ")
                index += 1
                while index < len(text) and text[index] in "\r\n \t":
                    index += 1
                continue
            else:
                result.append(char)
        else:
            result.append(char)
            if char == '"':
                in_string = True
                previous = index - 1
                while previous >= 0 and text[previous] in " \t\r\n":
                    previous -= 1
                string_is_key = previous >= 0 and text[previous] in "{,"
        index += 1
    if in_string:
        raise ValueError("JSON troncato: stringa non chiusa alla fine del file")
    return "".join(result)


def extract_json_objects(text: str) -> list[str]:
    objects = []
    start = None
    depth = 0
    in_string = False
    escaped = False
    for index, char in enumerate(text):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                objects.append(text[start : index + 1])
    if depth != 0:
        raise ValueError("Oggetto JSON troncato: graffe non bilanciate")
    return objects


def merge_packages(packages: list[dict]) -> dict:
    if not packages:
        raise ValueError("Nessun pacchetto JSON trovato nel file")
    merged = dict(packages[0])
    for package in packages[1:]:
        for key, value in package.items():
            if not isinstance(value, list):
                continue
            target = merged.setdefault(key, [])
            for item in value:
                item_id = item.get("id") if isinstance(item, dict) else None
                existing = next((entry for entry in target if item_id and entry.get("id") == item_id), None)
                if existing is None:
                    target.append(item)
                elif key == "editorial_units":
                    sections = {section.get("section_locus"): section for section in existing.get("sections", [])}
                    for section in item.get("sections", []):
                        current = sections.get(section.get("section_locus"))
                        if current is None:
                            existing.setdefault("sections", []).append(section)
                            continue
                        known = {passage.get("id") for passage in current.get("passages", [])}
                        current.setdefault("passages", []).extend(
                            passage for passage in section.get("passages", []) if passage.get("id") not in known
                        )
    return merged


def repair_editorial_metadata(package: dict) -> None:
    question_texts = {
        "q-che-rapporto-ce-tra-atman-e-brahman": "Qual è il rapporto tra Ātman e Brahman secondo la Chāndogya Upaniṣad?",
        "q-che-cosa-significa-realta": "Che cosa significa la realtà nella dottrina della Chāndogya Upaniṣad?",
        "q-che-cose-l-assoluto": "Che cos'è l'Assoluto secondo la Chāndogya Upaniṣad?",
    }
    for question in package.get("questions", []):
        if question.get("id") in question_texts:
            question.setdefault("type", "great")
            question.setdefault("text", question_texts[question["id"]])

    for concept in package.get("concepts", []):
        if concept.get("id") in {"vidya-avidya", "asura-vidya"}:
            concept["related_concepts"] = [
                "vidya-avidya" if related == "ignoranza" else related
                for related in concept.get("related_concepts", [])
            ]


def load_package() -> dict:
    text = TXT_PATH.read_text(encoding="utf-8")
    try:
        normalized = normalize_wrapped_json(text)
        packages = [json.loads(candidate) for candidate in extract_json_objects(normalized)]
        packages = [package for package in packages if package.get("package_format")]
        package = merge_packages(packages)
        repair_editorial_metadata(package)
        return package
    except json.JSONDecodeError as error:
        raise ValueError(f"JSON non parsabile dopo la normalizzazione: {error}") from error


def passages(package: dict) -> list[dict]:
    return [
        passage
        for unit in package.get("editorial_units", [])
        for section in unit.get("sections", [])
        for passage in section.get("passages", [])
    ]


def validate_completeness(package: dict) -> None:
    expected_sections = {1: 13, 2: 24, 3: 19, 4: 17, 5: 24, 6: 16, 7: 26, 8: 15}
    all_passages = passages(package)
    ids = [passage.get("id") for passage in all_passages]
    duplicates = sorted({item for item in ids if ids.count(item) > 1})
    if duplicates:
        raise ValueError(f"ID duplicati: {', '.join(duplicates)}")

    sections = [
        section
        for unit in package.get("editorial_units", [])
        for section in unit.get("sections", [])
        if section.get("section_locus") != "0.1"
    ]
    chapter_counts = {}
    for section in sections:
        chapter = int(section["section_locus"].split(".", 1)[0])
        chapter_counts[chapter] = chapter_counts.get(chapter, 0) + 1
    missing = {
        chapter: (expected, chapter_counts.get(chapter, 0))
        for chapter, expected in expected_sections.items()
        if chapter_counts.get(chapter, 0) != expected
    }
    if missing:
        detail = ", ".join(f"{chapter}: attesi {expected}, trovati {actual}" for chapter, (expected, actual) in missing.items())
        raise ValueError(f"Chandogya incompleta per capitolo: {detail}")

    if not any(passage.get("id") == "chandogya-santi-1" for passage in all_passages):
        raise ValueError("Invocazione iniziale mancante")


if __name__ == "__main__":
    package = load_package()
    validate_completeness(package)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = {chapter: 0 for chapter in range(1, 9)}
    for unit in package.get("editorial_units", []):
        for section in unit.get("sections", []):
            if section.get("section_locus") != "0.1":
                chapter = int(section["section_locus"].split(".", 1)[0])
                counts[chapter] += 1
    print(f"Creato {OUT_PATH} con {len(package.get('editorial_units', []))} unità e {len(passages(package))} passaggi.")
    print("Conteggi capitoli:", ", ".join(f"{chapter}={count}" for chapter, count in counts.items()))