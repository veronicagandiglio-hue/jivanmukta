#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "import" / "gemini" / "_scratch" / "brahdaranyaka.txt"
OUTPUT = ROOT / "import" / "gemini" / "incoming" / "brihadaranyaka-upanishad.json"


def repair_json_newlines(block: str) -> str:
    result = []
    in_string = False
    escaped = False
    for char in block:
        if in_string:
            if escaped:
                result.append(char)
                escaped = False
            elif char == "\\":
                result.append(char)
                escaped = True
            elif char == '"':
                result.append(char)
                in_string = False
            elif char in "\r\n":
                result.append("\\n")
            else:
                result.append(char)
        else:
            result.append(char)
            if char == '"':
                in_string = True
    return "".join(result)


def repair_mojibake(value):
    if isinstance(value, dict):
        return {key: repair_mojibake(item) for key, item in value.items()}
    if isinstance(value, list):
        return [repair_mojibake(item) for item in value]
    if not isinstance(value, str) or not re.search(r"[ÃÂáÄÅ]", value):
        return value
    try:
        return value.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value


def merge_values(existing, candidate):
    if existing is None or existing == "":
        return candidate
    if isinstance(existing, dict) and isinstance(candidate, dict):
        merged = dict(existing)
        for key, value in candidate.items():
            merged[key] = merge_values(merged[key], value) if key in merged else value
        return merged
    if isinstance(existing, list) and isinstance(candidate, list):
        merged = list(existing)
        for item in candidate:
            if item not in merged:
                merged.append(item)
        return merged
    return existing


def merge_entities(items):
    merged = {}
    order = []
    for item in items:
        item_id = item.get("id")
        if not item_id:
            continue
        if item_id not in merged:
            merged[item_id] = item
            order.append(item_id)
        else:
            merged[item_id] = merge_values(merged[item_id], item)
    return [merged[item_id] for item_id in order]


def extract_packages(text: str):
    starts = [match.start() for match in re.finditer(r'\{\s*"package_format"', text)]
    packages = []
    for index, start in enumerate(starts):
        depth = 0
        in_string = False
        escaped = False
        end = None
        for position in range(start, len(text)):
            char = text[position]
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
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = position + 1
                    break
        if end is None:
            raise RuntimeError(f"Blocco {index + 1} non ha una chiusura JSON bilanciata")
        block = repair_json_newlines(text[start:end].strip())
        try:
            packages.append(json.loads(block))
        except json.JSONDecodeError as error:
            context_start = max(0, error.pos - 300)
            context_end = min(len(block), error.pos + 300)
            print(f"Blocco {index + 1}: errore JSON alla posizione {error.pos}: {error.msg}")
            print(block[context_start:context_end])
            raise
    return packages


def normalize(packages):
    first = packages[0]
    work = dict(first["work"])
    work["id"] = "brihadaranyaka-upanishad"
    work["title"] = "Bṛhadāraṇyaka Upaniṣad"
    work["short_title"] = "Bṛhadāraṇyaka"
    work["language"] = "sa"
    work["attribution"] = "Śukla Yajurveda (Vājasaneyī Saṃhitā)"
    work.setdefault("editorial_note", [
        "Upaniṣad maggiore dello Śukla Yajurveda, articolata in sei Adhyāya e quarantasette Brāhmaṇa.",
        "Espone la cosmologia vedica, la dottrina dell'Ātman-Brahman, il metodo della negazione e gli insegnamenti di Yājñavalkya.",
        "Il testo è strutturato secondo la trasmissione tradizionale e il commentario di Śaṅkarācārya.",
    ])

    units = []
    authors = []
    concepts = []
    questions = []
    explanations = []
    commentaries = []
    notes = []
    for package in packages:
        units.extend(package.get("editorial_units", []))
        authors.extend(package.get("authors", []))
        concepts.extend(package.get("concepts", []))
        questions.extend(package.get("questions", []))
        explanations.extend(package.get("explanations", []))
        commentaries.extend(package.get("commentaries", []))
        notes.extend(package.get("notes", []))

    units = merge_entities(units)
    seen_passages = set()
    for unit in units:
        for section in unit.get("sections", []):
            unique_passages = []
            for passage in section.get("passages", []):
                if passage.get("id") in seen_passages:
                    continue
                seen_passages.add(passage.get("id"))
                unique_passages.append(passage)
            section["passages"] = unique_passages

    complete_questions = []
    for question in merge_entities(questions):
        if not question.get("type") or not question.get("text"):
            continue
        question.pop("parent_question", None)
        complete_questions.append(question)
    normalized_notes = []
    for note in merge_entities(notes):
        note_id = note.get("id", "")
        note_id = unicodedata.normalize("NFKD", note_id).encode("ascii", "ignore").decode("ascii")
        note_id = re.sub(r"[^a-z0-9]+", "-", note_id.lower()).strip("-")
        normalized_notes.append({
            "id": note_id,
            "term": note.get("term", ""),
            "passages": [note["passage_id"]] if note.get("passage_id") else note.get("passages", []),
            "text": note.get("text") or note.get("content", ""),
            "editorial_status": note.get("editorial_status", "draft"),
        })

    package = {
        "package_format": "jivanmukta-gemini-editorial-v1",
        "work": work,
        "authors": merge_entities(authors),
        "editorial_units": units,
        "concepts": merge_entities(concepts),
        "questions": complete_questions,
        "candidate_questions": [],
        "explanations": merge_entities(explanations),
        "commentaries": merge_entities(commentaries),
        "notes": merge_entities(normalized_notes),
        "relations": {"related_works": []},
        "notes_for_reviewer": [{
            "note": "Pacchetto normalizzato da 23 blocchi concatenati; verificare i riferimenti editoriali prima dell'approvazione.",
        }],
    }
    return repair_mojibake(package)


if __name__ == "__main__":
    raw = SOURCE.read_text(encoding="utf-8")
    packages = extract_packages(raw)
    if len(packages) != 23:
        raise RuntimeError(f"Attesi 23 blocchi JSON, trovati {len(packages)}")
    normalized = normalize(packages)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    passage_count = sum(
        len(section.get("passages", []))
        for unit in normalized["editorial_units"]
        for section in unit.get("sections", [])
    )
    print(f"Creato {OUTPUT} da {len(packages)} blocchi, {len(normalized['editorial_units'])} unità e {passage_count} passaggi.")