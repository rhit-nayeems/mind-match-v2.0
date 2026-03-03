from typing import Dict, List, Tuple
import hashlib

TRAIT_KEYS = [
    "darkness", "energy", "mood", "depth", "optimism",
    "novelty", "comfort", "intensity", "humor"
]

DISPLAY_NAME = {
    "darkness": "edge",
    "energy": "momentum",
    "mood": "atmosphere",
    "depth": "depth",
    "optimism": "warmth",
    "novelty": "novelty",
    "comfort": "familiarity",
    "intensity": "tension",
    "humor": "playfulness",
}

LOW_PREF = {
    "darkness": "very bleak material",
    "energy": "hyper-fast pacing",
    "mood": "style that ignores story",
    "depth": "dense, theory-heavy plots",
    "optimism": "overly sweet tone",
    "novelty": "highly experimental structure",
    "comfort": "overly cozy beats",
    "intensity": "constant high stress",
    "humor": "joke-heavy writing",
}


def _scale_num(x: float) -> float:
    try:
        v = float(x)
    except Exception:
        return 0.5
    if 0.0 <= v <= 1.0:
        return v
    if 1.0 <= v <= 5.0:
        return (v - 1.0) / 4.0
    if 0.0 <= v <= 100.0:
        return v / 100.0
    return max(0.0, min(1.0, v))


def _clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else 1.0 if v > 1.0 else float(v)


def _trait_map(traits: Dict[str, float]) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for k in TRAIT_KEYS:
        out[k] = _clamp01(_scale_num(traits.get(k, 0.5)))
    return out


def _signature(g: Dict[str, float]) -> str:
    bits = [f"{k}:{int(round(g[k] * 100))}" for k in TRAIT_KEYS]
    return "|".join(bits)


def _pick(options: List[str], sig: str, salt: str) -> str:
    if not options:
        return ""
    digest = hashlib.sha1(f"{sig}|{salt}".encode("utf-8")).hexdigest()
    idx = int(digest[:8], 16) % len(options)
    return options[idx]


def _pair_style(top_a: str, top_b: str) -> str:
    s = {top_a, top_b}
    if s == {"novelty", "energy"}:
        return "explorer"
    if s == {"comfort", "depth"}:
        return "reflective"
    if s == {"darkness", "intensity"}:
        return "edge"
    if s == {"humor", "optimism"}:
        return "bright"
    if s == {"mood", "depth"}:
        return "atmospheric"
    if "novelty" in s and "depth" in s:
        return "curious"
    if "comfort" in s and "optimism" in s:
        return "warm"
    return "balanced"


def _novelty_vs_comfort(g: Dict[str, float]) -> str:
    delta = g["novelty"] - g["comfort"]
    if delta >= 0.14:
        return "You lean toward discovery over familiarity, so unusual settings and fresh ideas should hit well."
    if delta <= -0.14:
        return "You lean toward familiarity over disruption, so grounded stories with emotional payoff should hit well."
    return "You sit near the middle of discovery and familiarity, so hybrid picks usually work best."


def _light_vs_dark(g: Dict[str, float]) -> str:
    delta = g["optimism"] - g["darkness"]
    if delta >= 0.12:
        return "Tone-wise, you skew brighter than dark and usually prefer hope over bleakness."
    if delta <= -0.12:
        return "Tone-wise, you can handle darker material, especially when the stakes feel earned."
    return "Tone-wise, you are comfortable with balanced light and shadow."


def answers_to_traits(answers: List[float]) -> Dict[str, float]:
    if not isinstance(answers, (list, tuple)) or len(answers) != 9:
        raise ValueError("answers must be a length-9 list/tuple of numbers")
    vals = [_scale_num(a) for a in answers]
    return {k: vals[i] for i, k in enumerate(TRAIT_KEYS)}


def summarize_traits(traits: Dict[str, float]) -> str:
    g = _trait_map(traits)
    ordered: List[Tuple[str, float]] = sorted(g.items(), key=lambda kv: kv[1], reverse=True)

    top1, top2, top3 = ordered[0], ordered[1], ordered[2]
    low1 = ordered[-1]

    sig = _signature(g)
    style = _pair_style(top1[0], top2[0])

    opener_map = {
        "explorer": [
            "You usually pick movies that feel fresh and kinetic.",
            "Your taste leans curious, fast-moving, and discovery-first.",
        ],
        "reflective": [
            "You gravitate toward grounded stories with substance.",
            "Your taste leans thoughtful, patient, and character-forward.",
        ],
        "edge": [
            "You are comfortable with tension and darker turns.",
            "Your taste leans high-stakes, intense, and emotionally bold.",
        ],
        "bright": [
            "You lean toward warmth, wit, and emotional lift.",
            "Your taste favors upbeat tone and playful writing.",
        ],
        "atmospheric": [
            "You care a lot about mood and cinematic texture.",
            "Your taste favors atmosphere and introspection.",
        ],
        "curious": [
            "You like concept-forward stories with real depth.",
            "Your taste leans original, idea-driven, and reflective.",
        ],
        "warm": [
            "You prefer emotionally warm stories that still feel earned.",
            "Your taste leans comforting, optimistic, and human.",
        ],
        "balanced": [
            "Your profile is balanced, with a few clear spikes.",
            "You have broad range, but some signals stand out.",
        ],
    }

    opener = _pick(opener_map.get(style, opener_map["balanced"]), sig, "opener")

    signal_sentence = (
        f"Top signals right now: {DISPLAY_NAME[top1[0]]}, {DISPLAY_NAME[top2[0]]}, and {DISPLAY_NAME[top3[0]]}."
    )

    pace = "faster pacing" if g["energy"] >= 0.60 else "steadier pacing"
    weight = "heavier emotional stakes" if g["intensity"] >= 0.58 else "a lighter emotional load"
    humor = "dry or playful humor" if g["humor"] >= 0.56 else "minimal humor"

    avoid_sentence = ""
    if low1[1] <= 0.34:
        avoid_sentence = f"Lower signal area: {LOW_PREF[low1[0]]} may land less often for you."

    close_options = [
        f"Best-fit picks should combine {pace}, {weight}, and {humor}.",
        f"Your strongest matches should lean toward {pace}, {weight}, and {humor}.",
    ]
    close_sentence = _pick(close_options, sig, "close")

    parts = [
        opener,
        signal_sentence,
        _novelty_vs_comfort(g),
        _light_vs_dark(g),
        close_sentence,
    ]
    if avoid_sentence:
        parts.append(avoid_sentence)

    return " ".join(parts)
