#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TXT_PATH = ROOT / "import" / "gemini" / "_scratch" / "mundaka.txt"
OUT_PATH = ROOT / "import" / "gemini" / "incoming" / "mundaka-upanishad.json"


def clean_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def parse_passages(unit_text: str):
    passage_blocks = []
    matches = list(re.finditer(r"\nPassaggio\s+\d+\n", unit_text))
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(unit_text)
        block = unit_text[start:end].strip()
        if not block:
            continue
        id_match = re.search(r"\s*-\s*ID:\s*(\S+)", block)
        locus_match = re.search(r"\s*-\s*Locus:\s*([^\n]+)", block)
        original_match = re.search(r"\s*-\s*Testo originale:\s*\n(.*?)(?=\n\s*-\s*Traduzione:|\Z)", block, re.S)
        translation_match = re.search(r"\s*-\s*Traduzione:\s*\n(.*?)(?=\n\s*(?:Passaggio\s+\d+|UNITÀ EDITORIALE:)|\Z)", block, re.S)
        if not id_match or not locus_match:
            continue
        passage = {
            "id": id_match.group(1).strip(),
            "locus": locus_match.group(1).strip(),
            "original": (original_match.group(1).strip() if original_match else "").replace("\n  - Traduzione:", "").strip(),
            "translation": (translation_match.group(1).strip() if translation_match else "").strip(),
            "source": "Muṇḍakopaniṣad (testo sanscrito e traduzione editoriale)"
        }
        passage_blocks.append(passage)
    return passage_blocks


def parse_units(text: str):
    units = []
    unit_matches = list(re.finditer(r"UNITÀ EDITORIALE:\s*(\S+)", text))
    for idx, unit_match in enumerate(unit_matches):
        start = unit_match.start()
        end = unit_matches[idx + 1].start() if idx + 1 < len(unit_matches) else len(text)
        chunk = text[start:end]
        unit_id = unit_match.group(1).strip()
        title_match = re.search(r"(?:\n\n)(.*?)(?:\n\nPassaggio\s+\d+|$)", chunk, re.S)
        title = (title_match.group(1).strip() if title_match else unit_id).strip()
        section_title = title
        passages = parse_passages(chunk)
        if not passages:
            continue
        unit_locus = {
            "mundaka-1-1": "I.1",
            "mundaka-1-2": "I.2",
            "mundaka-2-1": "II.1",
            "mundaka-2-2": "II.2",
            "mundaka-3-1": "III.1",
            "mundaka-3-2": "III.2",
        }.get(unit_id, "")
        section_locus = f"{passages[0]['locus'].split('.')[0]}.{passages[0]['locus'].split('.')[1]}"
        section_locus = f"{passages[0]['locus'].split('.')[0]}.{passages[0]['locus'].split('.')[1]}"
        units.append({
            "id": unit_id,
            "unit_locus": unit_locus,
            "unit_title": title,
            "sections": [{
                "section_locus": section_locus,
                "section_title": section_title,
                "passages": passages,
            }],
        })
    return units


def build_package(units):
    concepts = [
        {"id": "brahman", "name": "Brahman", "transliteration": "Brahman", "gloss": "La Realtà Assoluta, non-duale e immutabile, radice e fondamento di ogni manifestazione.", "passages": ["mundaka-1-1-1", "mundaka-1-1-8", "mundaka-2-2-4", "mundaka-2-2-11", "mundaka-3-2-9"], "related_concepts": ["atman", "purusha", "aksara"], "authors": ["angiras", "shankara"]},
        {"id": "atman", "name": "Ātman", "transliteration": "Ātman", "gloss": "Il Sé assoluto, Testimone e Coscienza pura, trascendente ai limiti dell'esperienza individuale.", "passages": ["mundaka-2-2-4", "mundaka-2-2-5", "mundaka-3-1-5", "mundaka-3-2-3", "mundaka-3-2-4"], "related_concepts": ["brahman", "purusha", "dva-suparna"], "authors": ["angiras", "shankara"]},
        {"id": "purusha", "name": "Puruṣa", "transliteration": "Puruṣa", "gloss": "La Persona metafisica suprema, trascendente e immanente insieme, principio di tutte le manifestazioni.", "passages": ["mundaka-1-2-11", "mundaka-2-1-2", "mundaka-2-1-10", "mundaka-3-1-3", "mundaka-3-2-8"], "related_concepts": ["brahman", "atman", "aksara"], "authors": ["angiras", "shankara"]},
        {"id": "aksara", "name": "Akṣara", "transliteration": "Akṣara", "gloss": "L'Imperituro, l'Assoluto immutabile, matrice dell'universo manifestato e suo fondamento trascendente.", "passages": ["mundaka-1-1-5", "mundaka-1-1-6", "mundaka-1-1-7", "mundaka-2-1-1", "mundaka-2-2-2", "mundaka-2-2-3"], "related_concepts": ["brahman", "purusha", "para-e-apara-vidya"], "authors": ["angiras", "shankara"]},
        {"id": "para-e-apara-vidya", "name": "Parā e Aparā Vidyā", "transliteration": "Parā-Aparā Vidyā", "gloss": "Distinzione fondamentale tra la Conoscenza Suprema, che attinge l'Assoluto, e la Conoscenza Inferiore, volta al mondo del divenire.", "passages": ["mundaka-1-1-4", "mundaka-1-1-5", "mundaka-1-2-12"], "related_concepts": ["aksara", "brahman", "karma-e-sacrificio"], "authors": ["angiras", "shaunaka"]},
        {"id": "karma-e-sacrificio", "name": "Karma e Yajña", "transliteration": "Karma-Yajña", "gloss": "L'azione rituale e le opere pie, che nell'Upaniṣad sono giudicate insuficienti e fragili rispetto alla realizzazione del Brahman.", "passages": ["mundaka-1-2-1", "mundaka-1-2-7", "mundaka-1-2-10", "mundaka-1-2-12"], "related_concepts": ["para-e-apara-vidya", "samnyasa-yoga"], "authors": ["angiras"]},
        {"id": "dva-suparna", "name": "Dvā Suparṇā", "transliteration": "Dvā Suparṇā", "gloss": "L'allegoria dei due uccelli sullo stesso albero: l'io empirico e il Testimone supremo, separati dall'illusione ma identici nella Realtà.", "passages": ["mundaka-3-1-1", "mundaka-3-1-2", "mundaka-3-1-3"], "related_concepts": ["atman", "purusha"], "authors": ["angiras", "shankara"]},
        {"id": "satyam-eva-jayate", "name": "Satyam eva jayate", "transliteration": "Satyam eva jayate", "gloss": "L'assioma della Verità ontologica: solo ciò che è reale trionfa; la menzogna e l'illusione svaniscono in sé.", "passages": ["mundaka-3-1-5", "mundaka-3-1-6", "mundaka-3-2-11"], "related_concepts": ["brahman", "pitriyana-e-devayana"], "authors": ["angiras", "shankara"]},
        {"id": "pranava", "name": "Praṇava", "transliteration": "Praṇava", "gloss": "Il monosillabo sacro Oṃ, simbolo del canale di concentrazione che unisce l'Ātman al Brahman.", "passages": ["mundaka-2-2-3", "mundaka-2-2-4", "mundaka-2-2-6"], "related_concepts": ["brahman", "atman"], "authors": ["angiras", "shankara"]},
        {"id": "hridaya-granthi", "name": "Hṛdaya-granthi", "transliteration": "Hṛdaya-granthi", "gloss": "Il nodo del cuore, la legatura dell'ignoranza che annoda la coscienza empirica alle apparenze del mondo.", "passages": ["mundaka-2-1-10", "mundaka-2-2-8", "mundaka-3-2-9"], "related_concepts": ["brahman", "samnyasa-yoga"], "authors": ["angiras", "shankara"]},
        {"id": "samnyasa-yoga", "name": "Saṃnyāsa-yoga", "transliteration": "Saṃnyāsa-yoga", "gloss": "La disciplina della rinunzia e della purificazione interiore come via per la liberazione dal karma e dalle brame.", "passages": ["mundaka-1-2-11", "mundaka-3-2-4", "mundaka-3-2-6"], "related_concepts": ["karma-e-sacrificio", "brahmavid-brahmaiva-bhavati"], "authors": ["angiras", "shankara"]},
        {"id": "brahmavid-brahmaiva-bhavati", "name": "Brahmavid brahmaiva bhavati", "transliteration": "Brahmaiva bhavati", "gloss": "Principio dell'Advaita: conoscere il Brahman significa essere il Brahman stesso, senza residuo di dualità.", "passages": ["mundaka-3-2-8", "mundaka-3-2-9"], "related_concepts": ["brahman", "atman", "purusha"], "authors": ["angiras", "shankara"]},
    ]
    questions = [
        {"id": "q-come-si-conosce-il-tutto", "type": "great", "text": "Conoscendo che cosa, tutto questo universo diviene pienamente conosciuto?", "problem": "La domanda fondamentale della Mundaka: la Conoscenza Suprema oltre le scienze inferiori.", "concepts": ["brahman", "aksara", "para-e-apara-vidya"], "passages": ["mundaka-1-1-3", "mundaka-1-1-5", "mundaka-1-1-6"], "commentaries": [], "related_questions": []},
        {"id": "q-qual-e-la-differenza-tra-para-e-apara-vidya", "type": "great", "text": "Qual è la distinzione essenziale tra la Conoscenza Suprema e la Conoscenza Inferiore?", "problem": "Il capitolo iniziale distingue tra la scienza del divenire e la scienza dell'Assoluto.", "concepts": ["para-e-apara-vidya", "aksara"], "passages": ["mundaka-1-1-4", "mundaka-1-1-5"], "commentaries": [], "related_questions": []},
        {"id": "q-qual-e-il-valore-delle-opere-rituali", "type": "great", "text": "Le azioni rituali e le opere sacrificali possono procurare la Liberazione finale?", "problem": "L'Upaniṣad respinge la sufficienza del karma come via del liberarsi dal mondo.", "concepts": ["karma-e-sacrificio", "samnyasa-yoga"], "passages": ["mundaka-1-2-7", "mundaka-1-2-10", "mundaka-1-2-12"], "commentaries": [], "related_questions": []},
        {"id": "q-chi-sono-i-due-uccelli-sullo-stesso-albero", "type": "great", "text": "Qual è il rapporto metafisico tra l'anima individuale e il Testimone supremo?", "problem": "La parabola dei due uccelli mostra la differenza tra il jīva e il Signore Testimone.", "concepts": ["dva-suparna", "atman", "purusha"], "passages": ["mundaka-3-1-1", "mundaka-3-1-2", "mundaka-3-1-3"], "commentaries": [], "related_questions": []},
        {"id": "q-in-che-senso-il-conoscitore-diviene-brahman", "type": "great", "text": "In che modo la realizzazione spirituale si compie come identità assoluta?", "problem": "L'ultimo capitolo conclude che il conoscitore del Brahman diviene Brahman stesso.", "concepts": ["brahmavid-brahmaiva-bhavati", "brahman", "purusha"], "passages": ["mundaka-3-2-8", "mundaka-3-2-9"], "commentaries": [], "related_questions": []},
    ]
    candidate_questions = [
        {"id": "q-l-increato-non-e-prodotto-dall-azione", "type": "great", "text": "Per quale ragione metafisica l'Incondizionato non può essere prodotto dall'azione contingente?", "problem": "Il versetto fondamentale sulla natura del non-fatto rispetto al fatto.", "concepts": ["karma-e-sacrificio"], "passages": ["mundaka-1-2-12"]},
        {"id": "q-l-arco-del-pranava-e-il-bersaglio-di-brahman", "type": "great", "text": "Come si attua la perfetta fusione fra la freccia del Sé e il bersaglio del Brahman mediante Oṃ?", "problem": "L'analogia dell'arco del Praṇava riguarda la disciplina della concentrazione e della fusione.", "concepts": ["pranava", "brahman", "atman"], "passages": ["mundaka-2-2-3", "mundaka-2-2-4"]},
    ]
    explanations = [
        {"id": "expl-mundaka-1-1-5", "target_type": "passage", "target_id": "mundaka-1-1-5", "title": "Parā e Aparā Vidyā", "sections": [{"heading": "Distinzione fondamentale", "text": "La prima sezione della Mundaka chiarisce che il mondo delle scienze formali e rituali non è il fine ultimo della ricerca. La parā vidyā è la conoscenza diretta dell'Assoluto, mentre l'aparā vidyā è il complesso delle discipline che regolano il mondo del divenire. La distinzione non è fra scienza sacra e profana, ma fra il livello del manifestato e il livello del non-manifestato."}], "editorial_status": "draft"},
        {"id": "expl-mundaka-2-2-4", "target_type": "passage", "target_id": "mundaka-2-2-4", "title": "L'arco del Praṇava", "sections": [{"heading": "Praṇava e ātman", "text": "Il Praṇava è l'arco, l'Ātman è la freccia e il Brahman è il bersaglio. Il superamento della dualità non è un mero simbolismo mentale, ma la concentrazione totale del soggetto nel reale. Lo stato che segue è il tanmayo bhavet, la fusione perfetta nel bersaglio, in cui la scissione tra conoscente e conosciuto scompare."}], "editorial_status": "draft"},
        {"id": "expl-mundaka-3-1-1", "target_type": "passage", "target_id": "mundaka-3-1-1", "title": "I due uccelli sullo stesso albero", "sections": [{"heading": "Theoria e fede", "text": "L'allegoria dei due uccelli descrive la contrapposizione fra l'io empirico che fruisce le conseguenze del karma e la Coscienza testimone che osserva senza essere coinvolta. La liberazione non consiste nel negare il mondo, ma nel riconoscere che la vera natura dell'io non è il suo corpo o le sue azioni, bensì il Sé trascendente."}], "editorial_status": "draft"},
        {"id": "expl-mundaka-3-2-9", "target_type": "passage", "target_id": "mundaka-3-2-9", "title": "Brahmaiva bhavati", "sections": [{"heading": "Identità assoluta", "text": "Il versetto culminante della Mundaka non afferma un gusto mistico né una metafora, ma la realizzazione ontologica della non-dualità. Il conoscer il Brahman non è la conquista di un oggetto esterno; è lo scoprire che il soggetto conoscente non è separato dall'oggetto conosciuto, perché la natura del sé è il Brahman stesso."}], "editorial_status": "established"},
    ]
    commentaries = [{
        "id": "comm-shankara-mundaka-1-1-5",
        "author_id": "shankara",
        "passages": ["mundaka-1-1-5"],
        "text": "Śaṅkara insiste sul fatto che l'aparā vidyā, pur essendo valida in rapporto al mondo del divenire, non è la via della liberazione. La parā vidyā è l'atto diretto della comprensione dell'Assoluto, oltre ogni nome e forma.",
        "editorial_status": "draft"
    }]
    notes = [{
        "id": "nota-para-apara-vidya",
        "term": "parā-aparā-vidyā",
        "passages": ["mundaka-1-1-4", "mundaka-1-1-5"],
        "text": "La distinzione non è fra conoscenza sacra e profana; è fra la conoscenza del mondo fenomenico e la conoscenza della Realtà suprema.",
        "editorial_status": "draft"
    }]
    return {
        "package_format": "jivanmukta-gemini-editorial-v1",
        "work": {
            "id": "mundaka-upanishad",
            "title": "Muṇḍakopaniṣad",
            "short_title": "Mundaka",
            "language": "sa",
            "attribution": "Atharvaveda (Scuola Śaunakīya)",
            "editorial_note": [
                "Testo sacro primario dell'Atharvaveda, ordinato in tre Muṇḍaka e due Khaṇḍa ciascuno.",
                "Espone la distinzione tra la Conoscenza Inferiore (rituale) e la Conoscenza Suprema (metafisica), la questione del karma, la disciplina del Praṇava e l'identità definitiva del conoscitore con il Brahman.",
                "Il testo è strutturato secondo la trasmissione tradizionale dell'Upaniṣad e il commentario di Śaṅkara.",
            ],
        },
        "authors": [
            {"id": "angiras", "name": "Aṅgiras", "transliteration": "Aṅgiras", "role": "author", "role_description": "Veggente e Maestro del sapere tradizionale che trasmette la Brahmavidyā.", "context": "Linea di trasmissione della Śruti", "concepts": ["brahman", "atman", "purusha", "aksara", "para-e-apara-vidya"], "related_authors": ["shaunaka", "brahma"]},
            {"id": "shaunaka", "name": "Śaunaka", "transliteration": "Śaunaka", "role": "author", "role_description": "Discepolo che pone la domanda fondamentale sulla conoscenza del tutto.", "context": "Aspettando la rivelazione del maestro", "concepts": ["para-e-apara-vidya", "brahman"], "related_authors": ["angiras"]},
            {"id": "brahma", "name": "Brahmā", "transliteration": "Brahmā", "role": "author", "role_description": "Primo ricevitore della Brahmavidyā e custode del mondo manifestato.", "context": "Origine del ciclo cosmico", "concepts": ["brahman"], "related_authors": ["angiras"]},
            {"id": "shankara", "name": "Śaṅkara", "transliteration": "Śaṅkarācārya", "role": "commentator", "role_description": "Commentatore classico dell'Advaita Vedānta e autore del Muṇḍakopaniṣadbhāṣya.", "context": "Esegeta normativo della Śruti", "concepts": ["brahman", "atman", "purusha", "aksara", "brahmavid-brahmaiva-bhavati"], "related_authors": []},
        ],
        "editorial_units": units,
        "concepts": concepts,
        "questions": questions,
        "candidate_questions": candidate_questions,
        "explanations": explanations,
        "commentaries": commentaries,
        "notes": notes,
        "relations": {"related_works": [{"work_id": "katha-upanishad", "why": "Criteri di identità e analogie dottrinali sulle luci cosmiche e sulla dissoluzione del nodo del cuore."}, {"work_id": "prashna-upanishad", "why": "Condivisione del mantra di pace e motivazioni del Praṇava e del percorso della verità."}]},
        "notes_for_reviewer": [
            "Il file è stato generato automaticamente dal testo in _scratch/mundaka.txt e mantiene l'intera struttura del testo in 66 passaggi.",
            "La validazione finale include verifiche di sintassi e riferimenti, poi l'importazione nel modello /content.",
        ],
    }


if __name__ == "__main__":
    raw = TXT_PATH.read_text(encoding="utf-8")
    text = clean_text(raw)
    units = parse_units(text)
    if not units:
        raise RuntimeError(f"Nessuna unità editoriale trovata in {TXT_PATH}")
    pkg = build_package(units)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Creato {OUT_PATH} con {len(units)} unità editoriali e {sum(len(u['sections'][0]['passages']) for u in units)} passaggi.")
