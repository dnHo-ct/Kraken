import sys
import json
import os
from pathlib import Path
import pytesseract
from PIL import Image


def read_graphique(file_path: str) -> dict:
    errors = []

    try:
        img = Image.open(file_path)
    except Exception as e:
        return {"valid": False, "errors": [f"Impossible d'ouvrir l'image : {e}"], "levels": {}, "fibo": {}}

    text = pytesseract.image_to_string(img)
    lines = [t.replace("$", "").replace(",", "").replace(" ", "").strip() for t in text.split("\n")]
    prices = []
    for t in lines:
        t_clean = t.replace(".", "", 1)
        if t_clean.isdigit() and len(t) >= 2:
            try:
                prices.append(float(t))
            except ValueError:
                pass

    prices = sorted(set(prices))

    if len(prices) < 3:
        errors.append(f"Moins de 3 prix détectés via OCR ({len(prices)} trouvé(s)) — le graphique manque peut-être de texte lisible")

    levels = {}
    fibo = {}

    if len(prices) >= 3:
        val = min(prices)
        vah = max(prices)
        poc = prices[len(prices) // 2]

        if val >= vah:
            errors.append(f"VAL ({val}) >= VAH ({vah}) — données incohérentes")
        else:
            levels = {"VAL": round(val, 5), "POC": round(poc, 5), "VAH": round(vah, 5)}

            price_range = vah - val
            fibo_ratios = {
                "23.6": round(vah - price_range * 0.236, 5),
                "38.2": round(vah - price_range * 0.382, 5),
                "50.0": round(vah - price_range * 0.500, 5),
                "61.8": round(vah - price_range * 0.618, 5),
                "78.6": round(vah - price_range * 0.786, 5),
                "100.0": round(val, 5),
            }
            fibo = fibo_ratios

    return {
        "valid": len(errors) == 0 and bool(levels),
        "errors": errors,
        "prix_detectes_count": len(prices),
        "prix_detectes": prices[:20],
        "levels": levels,
        "fibo": fibo,
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: phase0_reader.py <image_path> <output_path>"}))
        sys.exit(1)

    image_path = sys.argv[1]
    output_path = sys.argv[2]

    result = read_graphique(image_path)

    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    status = "VALIDE" if result["valid"] else "INVALIDE"
    print(f"Phase 0 — {Path(image_path).name} : {status} ({result['prix_detectes_count']} prix détectés)")
