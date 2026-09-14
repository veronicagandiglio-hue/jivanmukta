#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TXT_PATH = ROOT / "import" / "gemini" / "_scratch" / "mandukya.txt"
OUT_PATH = ROOT / "import" / "gemini" / "incoming" / "mandukya-upanishad.json"


def clean_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def parse_passages(text: str):
    passage_blocks = []
    matches = list(re.finditer(r"\nPassaggio\s+\d+\n", text))
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        block = text[start:end].strip()
        if not block:
            continue

        id_match = re.search(r"\s*-\s*ID:\s*(\S+)", block)
        locus_match = re.search(r"\s*-\s*Locus:\s*([^\n]+)", block)
        original_match = re.search(r"\s*-\s*Testo originale:\s*\n(.*?)(?=\n\s*-\s*Traduzione:|\Z)", block, re.S)
        translation_match = re.search(r"\s*-\s*Traduzione:\s*\n(.*)\s*\Z", block, re.S)

        if not id_match or not locus_match:
            continue

        original = (original_match.group(1).strip() if original_match else "").strip()
        translation = (translation_match.group(1).strip() if translation_match else "").strip()

        passage_blocks.append({
            "id": id_match.group(1).strip(),
            "locus": locus_match.group(1).strip(),
            "original": original,
            "translation": translation,
            "source": "Māṇḍūkya Upaniṣad (testo sanscrito e traduzione editoriale)",
        })

    return passage_blocks


def build_package(passages):
    concepts = [
        {
            "id": "brahman",
            "name": "Brahman",
            "transliteration": "Brahman",
            "gloss": "La Realtà Assoluta, non-duale e immutabile, fondamento ultimo di tutte le manifestazioni.",
            "passages": ["mandukya-1-2", "mandukya-1-6", "mandukya-1-10", "mandukya-1-12"],
            "related_concepts": ["atman", "pranava", "turiya"],
            "authors": ["shankara"]
        },
        {
            "id": "atman",
            "name": "Ātman",
            "transliteration": "Ātman",
            "gloss": "Il Sé supremo, Testimone della coscienza, identico alla sostanza ultima del reale.",
            "passages": ["mandukya-1-2", "mandukya-1-7", "mandukya-1-8", "mandukya-1-12"],
            "related_concepts": ["brahman", "pranava", "turiya"],
            "authors": ["shankara"]
        },
        {
            "id": "pranava",
            "name": "Praṇava",
            "transliteration": "Praṇava",
            "gloss": "La sillaba sacra Oṃ, sintesi della totalità del reale e del suo manifestarsi in misura.",
            "passages": ["mandukya-1-1", "mandukya-1-8", "mandukya-1-9", "mandukya-1-12"],
            "related_concepts": ["brahman", "atman", "turiya"],
            "authors": ["shankara"]
        },
        {
            "id": "turiya",
            "name": "Turīya",
            "transliteration": "Turīya",
            "gloss": "Il Quarto, stato incondizionato, inoggettivabile, privo di misura e non-duale.",
            "passages": ["mandukya-1-7", "mandukya-1-8", "mandukya-1-12"],
            "related_concepts": ["brahman", "atman", "pranava"],
            "authors": ["shankara"]
        },
    ]

    questions = [
        {
            "id": "q-chi-e-l-om-nella-mandukya",
            "type": "great",
            "text": "Che significato metafisico assume la sillaba Oṃ nella Māṇḍūkya Upaniṣad?",
            "problem": "Il testo identifica Oṃ con la totalità del reale e con ciò che trascende il tempo.",
            "concepts": ["pranava", "brahman", "atman"],
            "passages": ["mandukya-1-1", "mandukya-1-8", "mandukya-1-12"],
            "commentaries": [],
            "related_questions": []
        },
        {
            "id": "q-qual-e-il-quarto-stato",
            "type": "great",
            "text": "Che cosa è il Turīya e in che senso esso trascende i tre stati ordinari di coscienza?",
            "problem": "La dottrina dei quattro quarti presenta il Quarto come l'Ātman incondizionato non-duale.",
            "concepts": ["turiya", "atman", "brahman"],
            "passages": ["mandukya-1-7", "mandukya-1-12"],
            "commentaries": [],
            "related_questions": []
        }
    ]

    package = {
        "package_format": "jivanmukta-gemini-editorial-v1",
        "work": {
            "id": "mandukya-upanishad",
            "title": "Māṇḍūkya Upaniṣad",
            "short_title": "Māṇḍūkya",
            "language": "sa",
            "attribution": "Atharvaveda",
            "editorial_note": [
                "Upaniṣad breve ma fondamentale dell'Atharvaveda, composta da una invocazione iniziale, dodici mantra centrali e una invocazione conclusiva.",
                "Espone l'identità dell'Ātman con Brahman, la dottrina dei quattro quarti e la centralità della sillaba sacra Oṃ.",
                "Il testo è tradizionalmente associato al commentario di Śaṅkara e alla sintesi della coscienza non-duale."
            ]
        },
        "authors": [
            {
                "id": "shankara",
                "name": "Śaṅkara",
                "transliteration": "Śaṅkarācārya",
                "role": "commentator",
                "role_description": "Maestro dell'Advaita Vedānta, commentatore della tradizione upaniṣadica.",
                "context": "Esponente della tradizione ortodossa non-duale della Śruti.",
                "concepts": ["brahman", "atman", "pranava", "turiya"],
                "related_authors": []
            },
            {
                "id": "vedic-rishis",
                "name": "Vedic Rishis",
                "transliteration": "Vedic Rishis",
                "role": "author",
                "role_description": "Veggenti della tradizione vedica, portatori della śruti e della tradizione orale.",
                "context": "Formazione primaria della trasmissione upaniṣadica.",
                "concepts": ["brahman", "atman", "pranava"],
                "related_authors": []
            }
        ],
        "editorial_units": [
            {
                "id": "mandukya-1",
                "unit_locus": "I.0-I.13",
                "unit_title": "Māṇḍūkya Upaniṣad — unità unica",
                "sections": [
                    {
                        "section_locus": "I.0-I.13",
                        "section_title": "Invocazione, dodici mantra e chiusura",
                        "passages": passages,
                    }
                ]
            }
        ],
        "concepts": concepts,
        "questions": questions,
        "candidate_questions": [],
        "explanations": [],
        "commentaries": [],
        "notes": [],
        "relations": {
            "related_works": [
                {"work_id": "mundaka-upanishad", "why": "Condivisione della sintesi tra Praṇava, Brahman e la liberazione della conoscenza."}
            ]
        },
        "notes_for_reviewer": [
            "Il pacchetto è stato generato automaticamente dal file di testo sorgente in _scratch/mandukya.txt.",
            "La struttura è una singola unità editoriale con 14 passaggi, inclusi invocazioni iniziali e finali."
        ]
    }
    return package


if __name__ == "__main__":
    raw = TXT_PATH.read_text(encoding="utf-8")
    text = clean_text(raw)
    passages = parse_passages(text)
    if not passages:
        raise RuntimeError(f"Nessun passaggio trovato in {TXT_PATH}")

    package = build_package(passages)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Creato {OUT_PATH} con {len(passages)} passaggi.")