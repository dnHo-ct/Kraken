import json
import sys


def price_range(graphique: dict) -> float:
    prices = graphique.get("prix_detectes", [])
    if len(prices) < 2:
        return 0.0
    return max(prices) - min(prices)


def score_confluence(graphique: dict) -> int:
    score = 0
    vp = graphique.get("volume_profile", {})
    val = vp.get("VAL")
    vah = vp.get("VAH")
    poc = vp.get("POC")

    obs = graphique.get("order_blocks_detectes", [])
    if obs:
        score += 25

    zones_fibo = graphique.get("zones_fibo", [])
    ob_levels = {ob.get("niveau") for ob in obs}
    fibo_valid = any(
        z.get("niveau") in ob_levels and val is not None and vah is not None
        for z in zones_fibo
    )
    if fibo_valid:
        score += 20

    if val is not None and vah is not None and poc is not None:
        score += 20

    cvd = graphique.get("CVD", {})
    if isinstance(cvd, dict) and cvd.get("pression"):
        score += 15

    micro = graphique.get("micro_structure", "")
    if micro and micro.lower() != "n/a":
        score += 10

    obpi = graphique.get("OBPI", {})
    if isinstance(obpi, dict) and obpi.get("niveau_algo"):
        score += 10

    return score


def detect_bias(graphique: dict) -> str:
    cvd = graphique.get("CVD", {})
    pression = ""
    if isinstance(cvd, dict):
        pression = cvd.get("pression", "").lower()
    delta = cvd.get("delta", 0) if isinstance(cvd, dict) else 0

    micro = (graphique.get("micro_structure") or "").lower()

    if "achat" in pression or delta > 0 or "haussier" in micro:
        return "bullish"
    elif "vente" in pression or delta < 0 or "baissier" in micro:
        return "bearish"
    return "range"


def fuse(validated_graphiques: list) -> dict:
    valid = [g for g in validated_graphiques if g.get("valid")]

    if not valid:
        return {"error": "Aucun graphique valide pour la fusion", "confluence_score": 0}

    sorted_by_range = sorted(valid, key=price_range, reverse=True)
    htf = sorted_by_range[0]
    ltf = sorted_by_range[-1] if len(sorted_by_range) > 1 else sorted_by_range[0]

    htf_bias = detect_bias(htf)
    ltf_bias = detect_bias(ltf)

    if htf_bias != "range" and ltf_bias != htf_bias:
        ltf_bias = htf_bias

    all_obs = []
    for i, g in enumerate(sorted_by_range):
        priority = "HTF" if i == 0 else "LTF"
        for ob in g.get("order_blocks_detectes", []):
            ob_copy = dict(ob)
            ob_copy["source"] = priority
            all_obs.append(ob_copy)

    htf_vp = htf.get("volume_profile", {})
    ltf_vp = ltf.get("volume_profile", {}) if ltf != htf else {}

    htf_cvd = htf.get("CVD", {})
    cvd_confirms = False
    if isinstance(htf_cvd, dict):
        pression = htf_cvd.get("pression", "").lower()
        delta = htf_cvd.get("delta", 0)
        if htf_bias == "bullish" and ("achat" in pression or delta > 0):
            cvd_confirms = True
        elif htf_bias == "bearish" and ("vente" in pression or delta < 0):
            cvd_confirms = True

    total_score = 0
    for g in valid:
        total_score += score_confluence(g)
    confluence_score = min(100, total_score // len(valid))

    fusion = {
        "timeframes_count": len(valid),
        "HTF": {
            "fichier": htf.get("fichier"),
            "bias": htf_bias,
            "volume_profile": htf_vp,
            "order_blocks": [ob for ob in all_obs if ob.get("source") == "HTF"],
            "CVD": htf.get("CVD"),
            "micro_structure": htf.get("micro_structure"),
        },
        "LTF": {
            "fichier": ltf.get("fichier") if ltf != htf else None,
            "bias": ltf_bias,
            "volume_profile": ltf_vp,
            "order_blocks": [ob for ob in all_obs if ob.get("source") == "LTF"],
            "micro_structure": ltf.get("micro_structure") if ltf != htf else None,
        },
        "global_bias": htf_bias,
        "order_blocks_hierarchises": all_obs,
        "cvd_confirms_direction": cvd_confirms,
        "confluence_score": confluence_score,
        "rejected": confluence_score < 60,
        "rejection_reason": "Score de confluence insuffisant (< 60)" if confluence_score < 60 else None,
    }

    return fusion


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Aucun fichier fourni"}))
        sys.exit(1)

    output_path = sys.argv[2] if len(sys.argv) >= 3 else "output/fusion.json"

    with open(sys.argv[1], "r") as f:
        validated = json.load(f)

    result = fuse(validated)

    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"Fusion terminée — score confluence : {result.get('confluence_score')}/100")
    if result.get("rejected"):
        print(f"SETUP REJETÉ : {result.get('rejection_reason')}")
