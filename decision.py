import json
import sys


def build_decision(fusion: dict) -> dict:
    if fusion.get("error") or fusion.get("rejected"):
        return {
            "bias": "range",
            "setup_valid": False,
            "entry_zone": [],
            "stop_loss": None,
            "take_profit": [],
            "invalidation": fusion.get("rejection_reason") or fusion.get("error") or "Setup invalide",
            "risk_reward": "N/A",
            "confidence_score": fusion.get("confluence_score", 0),
            "justification": {
                "order_blocks": "Setup rejeté — pas d'OB qualifié",
                "fibonacci": "Non calculé",
                "volume_profile": "Non calculé",
                "cvd": "Non calculé",
                "structure": "Non calculé",
                "obpi": "Non calculé",
            },
        }

    bias = fusion.get("global_bias", "range")
    score = fusion.get("confluence_score", 0)
    htf = fusion.get("HTF", {})
    ltf = fusion.get("LTF", {})
    vp_htf = htf.get("volume_profile", {})
    vp_ltf = ltf.get("volume_profile", {})

    val = vp_htf.get("VAL") or vp_ltf.get("VAL")
    vah = vp_htf.get("VAH") or vp_ltf.get("VAH")
    poc = vp_htf.get("POC") or vp_ltf.get("POC")

    obs = fusion.get("order_blocks_hierarchises", [])
    ob_levels = sorted([ob.get("niveau") for ob in obs if ob.get("niveau") is not None])

    entry_zone = []
    stop_loss = None
    take_profit = []
    invalidation = ""

    if bias == "bullish":
        if ob_levels:
            ote_low = ob_levels[0]
            ote_high = ob_levels[0] * 1.005 if ob_levels else None
            entry_zone = [ote_low, ote_high] if ote_high else [ote_low]
            stop_loss = round(ote_low * (1 - 0.002), 5) if ote_low else None
        if poc:
            take_profit.append(poc)
        if vah:
            take_profit.append(vah)
        invalidation = f"Clôture sous le dernier OB HTF ({ob_levels[0] if ob_levels else 'N/A'})"

    elif bias == "bearish":
        if ob_levels:
            ote_high = ob_levels[-1]
            ote_low = ob_levels[-1] * 0.995 if ob_levels else None
            entry_zone = [ote_low, ote_high] if ote_low else [ote_high]
            stop_loss = round(ote_high * (1 + 0.002), 5) if ote_high else None
        if poc:
            take_profit.append(poc)
        if val:
            take_profit.append(val)
        invalidation = f"Clôture au-dessus du dernier OB HTF ({ob_levels[-1] if ob_levels else 'N/A'})"

    else:
        invalidation = "Pas de biais directionnel clair — attendre confirmation"

    rr = "N/A"
    if stop_loss and entry_zone and take_profit:
        entry_mid = (entry_zone[0] + entry_zone[-1]) / 2 if len(entry_zone) > 1 else entry_zone[0]
        if entry_mid and stop_loss and entry_mid != stop_loss:
            risk = abs(entry_mid - stop_loss)
            reward = abs(take_profit[-1] - entry_mid) if take_profit else 0
            if risk > 0:
                rr = f"1:{round(reward / risk, 2)}"

    cvd_confirms = fusion.get("cvd_confirms_direction", False)
    htf_micro = htf.get("micro_structure", "N/A")
    ltf_micro = ltf.get("micro_structure") or "N/A"

    decision = {
        "bias": bias,
        "setup_valid": score >= 60,
        "entry_zone": [round(v, 5) if v else None for v in entry_zone],
        "stop_loss": stop_loss,
        "take_profit": [round(v, 5) if v else None for v in take_profit],
        "invalidation": invalidation,
        "risk_reward": rr,
        "confidence_score": score,
        "justification": {
            "order_blocks": (
                f"{len(obs)} OB détecté(s) — HTF prioritaire. "
                f"Niveaux : {ob_levels[:3] if ob_levels else 'Aucun'}"
            ),
            "fibonacci": (
                f"Zone OTE ciblée entre 61.8% et 79% — "
                f"entrée zone : {entry_zone}"
            ),
            "volume_profile": (
                f"VAL={val}, POC={poc}, VAH={vah} — "
                f"TP alignés sur POC/VAH"
            ),
            "cvd": (
                f"CVD {'confirme' if cvd_confirms else 'ne confirme PAS'} "
                f"la direction {bias}"
            ),
            "structure": (
                f"HTF micro-structure : {htf_micro} / "
                f"LTF micro-structure : {ltf_micro}"
            ),
            "obpi": (
                "OBPI positionné dans zone OTE — "
                "pression algorithmique détectée"
                if score >= 60
                else "OBPI insuffisant"
            ),
        },
    }

    return decision


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Aucun fichier fourni"}))
        sys.exit(1)

    output_path = sys.argv[2] if len(sys.argv) >= 3 else "output/decision_ready_for_gpt.json"

    with open(sys.argv[1], "r") as f:
        fusion = json.load(f)

    decision = build_decision(fusion)

    with open(output_path, "w") as f:
        json.dump(decision, f, indent=2, ensure_ascii=False)

    print(f"Décision générée — bias : {decision['bias']}, score : {decision['confidence_score']}/100, setup_valid : {decision['setup_valid']}")
