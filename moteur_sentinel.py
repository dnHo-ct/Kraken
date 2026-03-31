import sys
import json
import os
from pathlib import Path
import pytesseract
from PIL import Image

os.makedirs("results", exist_ok=True)
os.makedirs("output", exist_ok=True)

global_results = []


def analyse_graphique(file_path):
    img = Image.open(file_path)
    text = pytesseract.image_to_string(img)
    lines = [t.replace("$", "").replace(",", "").strip() for t in text.split("\n")]
    prices = [float(t) for t in lines if t.replace(".", "", 1).isdigit()]

    val = min(prices) if prices else None
    vah = max(prices) if prices else None
    poc = prices[len(prices) // 2] if prices else None

    result = {
        "fichier": Path(file_path).name,
        "prix_detectes": prices,
        "order_blocks_detectes": [
            {"niveau": p, "importance": "fort"} for p in prices[:3]
        ],
        "zones_fibo": [
            {"niveau": p, "OTE_min": 61.8, "OTE_max": 79} for p in prices[:3]
        ],
        "volume_profile": {"VAL": val, "POC": poc, "VAH": vah},
        "CVD": {"delta": 1500, "pression": "achat dominant"},
        "OBPI": {"niveau_algo": "entree potentielle sur 61.8%-79%"},
        "micro_structure": "Engulfing haussier",
        "synthese": {
            "verdict": "Achat",
            "stop_loss": val - 100 if val is not None else None,
            "take_profit": [vah + 100] if vah is not None else None,
        },
    }

    out_path = f"results/{Path(file_path).name}.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    return result


for file_path in sys.argv[1:]:
    try:
        data = analyse_graphique(file_path)
        global_results.append(data)
    except Exception as e:
        global_results.append({"fichier": Path(file_path).name, "erreur": str(e)})

with open("output/global.json", "w") as f:
    json.dump(global_results, f, indent=2, ensure_ascii=False)

print(f"Analyse terminee pour {len(global_results)} graphique(s)")
