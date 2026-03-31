import json
import sys
from pathlib import Path


REQUIRED_FIELDS = [
    "prix_detectes",
    "order_blocks_detectes",
    "zones_fibo",
    "volume_profile",
    "CVD",
    "OBPI",
    "micro_structure",
]


def validate_graphique(data: dict) -> dict:
    errors = []

    for field in REQUIRED_FIELDS:
        if field not in data or data[field] is None:
            errors.append(f"Champ obligatoire manquant : {field}")

    prices = data.get("prix_detectes", [])
    if len(prices) < 3:
        errors.append(f"Moins de 3 prix détectés ({len(prices)} trouvé(s))")

    vp = data.get("volume_profile", {})
    val = vp.get("VAL")
    vah = vp.get("VAH")
    poc = vp.get("POC")

    if val is not None and vah is not None:
        if val >= vah:
            errors.append(f"VAL ({val}) >= VAH ({vah}) — Volume Profile invalide")
        if poc is not None and (poc < val or poc > vah):
            errors.append(f"POC ({poc}) hors de l'intervalle VAL/VAH ({val}/{vah})")

    data["valid"] = len(errors) == 0
    data["errors"] = errors
    return data


def validate_all(graphiques: list) -> list:
    return [validate_graphique(g) for g in graphiques]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Aucun fichier fourni"}))
        sys.exit(1)

    input_file = sys.argv[1]
    with open(input_file, "r") as f:
        graphiques = json.load(f)

    results = validate_all(graphiques)

    output_path = "output/validated.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    valid_count = sum(1 for g in results if g.get("valid"))
    print(f"Validation : {valid_count}/{len(results)} graphique(s) valide(s)")
