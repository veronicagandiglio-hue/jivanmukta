#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TXT_PATH = ROOT / "import" / "gemini" / "_scratch" / "taittiriya.txt"
OUT_PATH = ROOT / "import" / "gemini" / "incoming" / "taittiriya-upanishad.json"

UNIT_METADATA = {
    "taittiriya-1": {
        "locus": "I.1-I.12",
        "title": "Prathamā Śīkṣāvallī — La disciplina propedeutica, le corrispondenze cosmiche e l'ordinamento etico-tradizionale",
        "section_title": "Śīkṣāvallī",
    },
    "taittiriya-2": {
        "locus": "II.0-II.9",
        "title": "Dvitīyā Brahmānandavallī — La natura essenziale di Brahman, i cinque involucri e l'Assoluto quale Beatitudine",
        "section_title": "Brahmānandavallī",
    },
    "taittiriya-3": {
        "locus": "III.0-III.10",
        "title": "Tṛtīyā Bhṛguvallī — L'indagine discriminativa di Bhṛgu, la dialettica del Cibo e il canto estatico del Jīvanmukta",
        "section_title": "Bhṛguvallī",
    },
}


def clean_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def parse_passages(unit_text: str):
    passages = []
    markers = list(re.finditer(r"\nPassaggio\s+\d+\n", unit_text))
    for index, marker in enumerate(markers):
        start = marker.end()
        end = markers[index + 1].start() if index + 1 < len(markers) else len(unit_text)
        block = unit_text[start:end].strip()

        id_match = re.search(r"\s*-\s*ID:\s*(\S+)", block)
        locus_match = re.search(r"\s*-\s*Locus:\s*([^\n]+)", block)
        original_match = re.search(
            r"\s*-\s*Testo originale:\s*\n(.*?)(?=\n\s*-\s*Traduzione:|\Z)",
            block,
            re.S,
        )
        translation_match = re.search(r"\s*-\s*Traduzione:\s*\n(.*)\s*\Z", block, re.S)

        if not id_match or not locus_match:
            continue

        translation = translation_match.group(1).strip() if translation_match else ""
        for marker_text in ("\n8. EVENTUALI PROBLEMI", "\nRIEPILOGO", "\nPARTE A", "\nB."):
            translation = translation.split(marker_text, 1)[0].rstrip()

        passages.append({
            "id": id_match.group(1).strip(),
            "locus": locus_match.group(1).strip(),
            "original": original_match.group(1).strip() if original_match else "",
            "translation": translation,
            "source": "Taittirīyopaniṣad (testo sanscrito e traduzione editoriale)",
        })
    return passages


def parse_units(text: str):
    units = []
    markers = list(re.finditer(r"-\s*ID Unità Editoriale:\s*(taittiriya-\d+)\s*", text))
    for index, marker in enumerate(markers):
        unit_id = marker.group(1)
        start = marker.start()
        end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
        passages = parse_passages(text[start:end])
        if not passages:
            continue

        metadata = UNIT_METADATA[unit_id]
        units.append({
            "id": unit_id,
            "unit_locus": metadata["locus"],
            "unit_title": metadata["title"],
            "sections": [{
                "section_locus": metadata["locus"],
                "section_title": metadata["section_title"],
                "passages": passages,
            }],
        })
    return units


def passage_ids(units, *fragments):
    result = []
    for unit in units:
        for passage in unit["sections"][0]["passages"]:
            if any(fragment in passage["id"] for fragment in fragments):
                result.append(passage["id"])
    return result


def build_package(units):
    concepts = [
        {
            "id": "brahman",
            "name": "Brahman",
            "transliteration": "Brahman",
            "gloss": "La Realtà Assoluta, immutabile e non-duale, causa trascendente e immanente di tutti i mondi.",
            "passages": passage_ids(units, "-2-1-1", "-2-2-1", "-2-9-1", "-3-1-1"),
            "related_concepts": ["atman", "purusha", "pranava"],
            "authors": ["shankara", "vedic-rishis"],
        },
        {
            "id": "atman",
            "name": "Ātman",
            "transliteration": "Ātman",
            "gloss": "Il Sé interiore e universale, fondamento della persona e realtà identica al Brahman.",
            "passages": passage_ids(units, "-2-1-1", "-2-7-1", "-2-8-1", "-3-10-7"),
            "related_concepts": ["brahman", "purusha", "pranava"],
            "authors": ["shankara", "vedic-rishis"],
        },
        {
            "id": "pranava",
            "name": "Praṇava",
            "transliteration": "Praṇava",
            "gloss": "La sillaba sacra Oṃ, meditata come Brahman e totalità dell'essere.",
            "passages": passage_ids(units, "-1-1-1", "-1-8-1", "-1-10-1"),
            "related_concepts": ["brahman", "atman"],
            "authors": ["shankara", "vedic-rishis"],
        },
        {
            "id": "purusha",
            "name": "Puruṣa",
            "transliteration": "Puruṣa",
            "gloss": "La Persona cosmica e interiore, principio vivente presente nell'uomo e nel cosmo.",
            "passages": passage_ids(units, "-1-6-1", "-2-1-1", "-2-6-1"),
            "related_concepts": ["brahman", "atman"],
            "authors": ["shankara", "vedic-rishis"],
        },
        {
            "id": "satya",
            "name": "Satya",
            "transliteration": "Satya",
            "gloss": "La Verità come principio della parola, della condotta e dell'ordine reale.",
            "passages": passage_ids(units, "-1-1-1", "-1-11-1"),
            "related_concepts": ["brahman"],
            "authors": ["shankara", "vedic-rishis"],
        },
        {
            "id": "vidya",
            "name": "Vidyā",
            "transliteration": "Vidyā",
            "gloss": "La conoscenza e trasmissione disciplinata della verità vedica, orientata alla realizzazione del Brahman.",
            "passages": passage_ids(units, "-1-2-1", "-1-3-1", "-1-11-1"),
            "related_concepts": ["brahman", "satya"],
            "authors": ["shankara", "vedic-rishis"],
        },
    ]

    questions = [
        {
            "id": "q-che-cosa-e-il-brahman-nella-taittiriya",
            "type": "great",
            "text": "Come definisce la Taittirīya Upaniṣad la natura del Brahman e il suo rapporto con il Sé?",
            "problem": "La Brahmānandavallī presenta Brahman come verità, conoscenza e infinito, fondamento dell'Ātman e della beatitudine.",
            "concepts": ["brahman", "atman"],
            "passages": passage_ids(units, "-2-1-1", "-2-2-1", "-2-8-1"),
            "commentaries": [],
            "related_questions": [],
        },
        {
            "id": "q-che-cosa-sono-i-cinque-involucri",
            "type": "great",
            "text": "In che modo la dottrina dei cinque involucri conduce dalla sostanza corporea al Sé di beatitudine?",
            "problem": "La progressione degli involucri distingue i livelli dell'esperienza fino al fondamento non-duale del Brahman.",
            "concepts": ["brahman", "atman"],
            "passages": passage_ids(units, "-2-1-1", "-2-2-1", "-2-5-1"),
            "commentaries": [],
            "related_questions": [],
        },
    ]

    return {
        "package_format": "jivanmukta-gemini-editorial-v1",
        "work": {
            "id": "taittiriya-upanishad",
            "title": "Taittirīyopaniṣad",
            "short_title": "Taittirīya",
            "language": "sa",
            "attribution": "Kṛṣṇa Yajurveda (scuola Taittirīya)",
            "editorial_note": [
                "Upaniṣad del Kṛṣṇa Yajurveda articolata nelle tre vallī canoniche: Śīkṣāvallī, Brahmānandavallī e Bhṛguvallī.",
                "Espone la disciplina propedeutica, la definizione di Brahman, la dottrina dei cinque involucri e l'indagine discriminativa di Bhṛgu.",
                "Il testo è strutturato secondo la trasmissione tradizionale dell'Upaniṣad e il commentario di Śaṅkarācārya.",
            ],
        },
        "authors": [
            {
                "id": "shankara",
                "name": "Śaṅkara",
                "transliteration": "Śaṅkarācārya",
                "role": "commentator",
                "role_description": "Maestro dell'Advaita Vedānta e autore del commentario classico alla Taittirīya Upaniṣad.",
                "context": "Esegeta normativo della Śruti e della dottrina non-duale.",
                "concepts": ["brahman", "atman", "pranava", "purusha", "satya", "vidya"],
                "related_authors": [],
            },
            {
                "id": "vedic-rishis",
                "name": "Vedic Rishis",
                "transliteration": "Vedic Rishis",
                "role": "author",
                "role_description": "Veggenti vedici della tradizione della Śruti trasmessa nella scuola Taittirīya.",
                "context": "Trasmissione orale e rituale del Kṛṣṇa Yajurveda.",
                "concepts": ["brahman", "atman", "pranava", "purusha", "satya", "vidya"],
                "related_authors": [],
            },
        ],
        "editorial_units": units,
        "concepts": concepts,
        "questions": questions,
        "candidate_questions": [],
        "explanations": [],
        "commentaries": [],
        "notes": [],
        "relations": {
            "related_works": [
                {"work_id": "mundaka-upanishad", "why": "Condivide la distinzione tra conoscenza rituale, conoscenza suprema e realizzazione del Brahman."},
                {"work_id": "mandukya-upanishad", "why": "Condivide la centralità del Praṇava, dell'Ātman e della non-dualità."},
            ]
        },
        "notes_for_reviewer": [
            "Il pacchetto è stato generato automaticamente dal testo sorgente in _scratch/taittiriya.txt.",
            "La struttura contiene tre unità editoriali e 55 passaggi complessivi.",
        ],
    }


if __name__ == "__main__":
    text = clean_text(TXT_PATH.read_text(encoding="utf-8"))
    units = parse_units(text)
    if len(units) != 3:
        raise RuntimeError(f"Attese 3 unità editoriali, trovate {len(units)}")

    package = build_package(units)
    passage_count = sum(len(section["passages"]) for unit in units for section in unit["sections"])
    if passage_count != 55:
        raise RuntimeError(f"Attesi 55 passaggi, trovati {passage_count}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Creato {OUT_PATH} con {len(units)} unità editoriali e {passage_count} passaggi.")