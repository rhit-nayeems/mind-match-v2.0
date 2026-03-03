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
    "energy": "constant high-velocity pacing",
    "mood": "pure style over story",
    "depth": "dense theory-heavy plotting",
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


def _novelty_vs_comfort(g: Dict[str, float], sig: str) -> str:
    delta = g["novelty"] - g["comfort"]
    if delta >= 0.14:
        options = [
            "You lean toward discovery over familiarity, so fresh ideas and unusual worlds should land well.",
            "You are in explore mode, so original concepts are more likely to click than safe repeats.",
        ]
        return _pick(options, sig, "novelty_high")
    if delta <= -0.14:
        options = [
            "You lean toward familiarity over disruption, so grounded stories with emotional payoff should land well.",
            "You are in comfort mode, so reliable tone and strong character beats should hit best.",
        ]
        return _pick(options, sig, "comfort_high")
    options = [
        "You are balanced between discovery and familiarity, so hybrid picks should feel right.",
        "You can go either way tonight, which gives room for variety without losing fit.",
    ]
    return _pick(options, sig, "balanced_nc")


def _light_vs_dark(g: Dict[str, float], sig: str) -> str:
    delta = g["optimism"] - g["darkness"]
    if delta >= 0.12:
        options = [
            "Tone-wise, you skew brighter than dark and usually prefer hope over bleakness.",
            "You currently favor warmth and lift, even when the story has weight.",
        ]
        return _pick(options, sig, "tone_bright")
    if delta <= -0.12:
        options = [
            "Tone-wise, you can handle darker material, especially when the stakes feel earned.",
            "You are comfortable with shadow and tension as long as the story commits.",
        ]
        return _pick(options, sig, "tone_dark")
    options = [
        "Tone-wise, you are comfortable with balanced light and shadow.",
        "Your tone preference sits in the middle, so balanced storytelling should work well.",
    ]
    return _pick(options, sig, "tone_mid")


def _rhythm_line(g: Dict[str, float], sig: str) -> str:
    energy = g["energy"]
    intensity = g["intensity"]
    humor = g["humor"]

    if energy >= 0.62 and intensity >= 0.58:
        base = _pick(
            [
                "Tonight looks high-voltage, so fast movement and real stakes should feel satisfying.",
                "Your current rhythm is high-energy, so momentum-heavy titles should click quickly.",
            ],
            sig,
            "rhythm_hot",
        )
    elif energy <= 0.42 and g["comfort"] >= 0.55:
        base = _pick(
            [
                "Tonight reads calmer, so a steadier pace with emotional clarity should feel right.",
                "Your current rhythm is quieter, so controlled pacing and strong mood should fit best.",
            ],
            sig,
            "rhythm_calm",
        )
    else:
        base = _pick(
            [
                "Your rhythm is balanced tonight, with room for both movement and story depth.",
                "You are in a middle tempo range, so a measured pace should land best.",
            ],
            sig,
            "rhythm_mid",
        )

    if humor >= 0.60:
        suffix = " A touch of wit should improve the match."
    elif humor <= 0.35:
        suffix = " Comedy does not need to carry the pick."
    else:
        suffix = " Light humor in the mix is likely enough."

    return base + suffix


def _satisfaction_line(spread: float, sig: str) -> str:
    if spread >= 0.40:
        return _pick(
            [
                "Your taste signal is very clear right now, so the recommendations should feel precise fast.",
                "This is a strong profile signature, so you should get on-target picks early.",
            ],
            sig,
            "satisfaction_high",
        )
    if spread >= 0.24:
        return _pick(
            [
                "Your profile has clear preferences with enough range to keep results fresh.",
                "You have a solid signal, so results should feel accurate without being repetitive.",
            ],
            sig,
            "satisfaction_mid",
        )
    return _pick(
        [
            "Your profile is more balanced tonight, so expect a thoughtful mix that still feels like you.",
            "Your signal is wide rather than narrow, so you should see a curated spread that stays relevant.",
        ],
        sig,
        "satisfaction_bal",
    )


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
    spread = float(top1[1] - low1[1])

    opener_map = {
        "explorer": [
            "You are in discovery mode tonight. Fresh ideas and movement matter to you.",
            "Your taste is leaning adventurous right now, with a clear pull toward novelty and pace.",
        ],
        "reflective": [
            "You are in a reflective zone tonight. Character and substance are doing most of the work.",
            "Your profile leans thoughtful and grounded, with depth taking the lead.",
        ],
        "edge": [
            "You are open to intensity tonight, especially when the stakes feel real.",
            "Your profile is edge-forward right now, with tension and commitment at the center.",
        ],
        "bright": [
            "You are leaning warm and upbeat tonight, with room for humor.",
            "Your profile favors emotional lift and playfulness right now.",
        ],
        "atmospheric": [
            "You are reading atmosphere-first tonight, with tone carrying a lot of weight.",
            "Your profile prioritizes mood and texture, then depth.",
        ],
        "curious": [
            "You are in a curious mode tonight, looking for ideas with substance.",
            "Your profile points toward concept-driven stories that still have emotional depth.",
        ],
        "warm": [
            "You are leaning toward warmth and emotional connection tonight.",
            "Your profile favors comfort with heart, not empty sweetness.",
        ],
        "balanced": [
            "Your profile is broad tonight, with a few clear peaks guiding the match.",
            "You have range, and a couple of strong signals are setting the direction.",
        ],
    }

    opener = _pick(opener_map.get(style, opener_map["balanced"]), sig, "opener")

    signal_sentence = (
        f"Strongest signals right now are {DISPLAY_NAME[top1[0]]}, {DISPLAY_NAME[top2[0]]}, and {DISPLAY_NAME[top3[0]]}."
    )

    boundary_sentence = ""
    if low1[1] <= 0.24:
        boundary_sentence = f"If a title leans too hard into {LOW_PREF[low1[0]]}, it may miss the mark tonight."

    parts = [
        opener,
        signal_sentence,
        _novelty_vs_comfort(g, sig),
        _light_vs_dark(g, sig),
        _rhythm_line(g, sig),
        _satisfaction_line(spread, sig),
    ]
    if boundary_sentence:
        parts.append(boundary_sentence)

    return " ".join(parts)
