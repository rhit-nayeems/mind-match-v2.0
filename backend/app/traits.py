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
    if s == {"darkness", "depth"}:
        return "brooding"
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
        "You can go either way right now, which gives room for variety without losing fit.",
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
                "Your rhythm is balanced right now, with room for both movement and story depth.",
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
            "Your profile is more balanced right now, so expect a thoughtful mix that still feels like you.",
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

    top1, top2 = ordered[0][0], ordered[1][0]
    sig = _signature(g)
    style = _pair_style(top1, top2)

    lead_phrases = {
        "darkness": "darker, moodier stories",
        "energy": "movies that move with purpose",
        "mood": "films with a strong atmosphere",
        "depth": "thoughtful stories with emotional depth",
        "optimism": "warmer, more openhearted films",
        "novelty": "fresh ideas and less predictable choices",
        "comfort": "grounded films you can settle into",
        "intensity": "stories with real tension and stakes",
        "humor": "films with wit and a lighter touch",
    }

    focus_nouns = {
        "darkness": "darker, moodier storytelling",
        "energy": "forward momentum",
        "mood": "atmosphere",
        "depth": "emotional depth",
        "optimism": "warmth",
        "novelty": "fresh ideas",
        "comfort": "grounded familiarity",
        "intensity": "tension",
        "humor": "wit",
    }

    lead_by_style = {
        "explorer": [
            "You seem drawn to movies that move and still surprise you.",
            "You seem to like films with momentum and a fresh edge.",
        ],
        "reflective": [
            "You seem drawn to grounded films with real emotional depth.",
            "You seem to connect most with thoughtful stories that still feel intimate.",
        ],
        "edge": [
            "You seem drawn to darker films that carry real pressure.",
            "You seem to like stories that keep their edge and commit to the tension.",
        ],
        "brooding": [
            "You seem drawn to darker films that still have real emotional depth.",
            "You seem to like movies that are intense in mood but thoughtful underneath.",
        ],
        "bright": [
            "You seem to enjoy warmer films with charm, lift, and a bit of wit.",
            "You seem most at home with movies that feel bright without becoming weightless.",
        ],
        "atmospheric": [
            "You seem to connect most with films that build atmosphere and linger emotionally.",
            "You seem drawn to movies you can sink into when the mood feels fully formed.",
        ],
        "curious": [
            "You seem to like thoughtful films that still bring something unexpected.",
            "You seem drawn to movies with depth, but not if they feel too familiar.",
        ],
        "warm": [
            "You seem most at home with warm, grounded films that are easy to settle into.",
            "You seem drawn to movies that feel reassuring without turning bland.",
        ],
    }

    if style in lead_by_style:
        lead = _pick(lead_by_style[style], sig, f"lead_{style}")
    else:
        lead = _pick(
            [
                f"You seem drawn to {lead_phrases[top1]}, with some room for {focus_nouns[top2]} too.",
                f"Your taste is leaning toward {lead_phrases[top1]}, while still leaving space for {focus_nouns[top2]}.",
            ],
            sig,
            f"lead_{top1}_{top2}",
        )

    novelty_gap = g["novelty"] - g["comfort"]
    tone_gap = g["optimism"] - g["darkness"]

    if novelty_gap >= 0.14:
        nuance = _pick(
            [
                "Right now, discovery matters more than familiarity, so fresher ideas should land better than safe repeats.",
                "You seem open to something less obvious, as long as it still feels purposeful.",
            ],
            sig,
            "nuance_novel",
        )
    elif novelty_gap <= -0.14:
        nuance = _pick(
            [
                "Right now, familiarity matters more than novelty, so grounded stories with a clear emotional payoff should land best.",
                "You seem to want something steady and emotionally legible more than something trying to surprise you.",
            ],
            sig,
            "nuance_comfort",
        )
    elif tone_gap >= 0.12:
        nuance = _pick(
            [
                "Tone-wise, you skew brighter than dark, even when the story still has some weight.",
                "You currently seem more responsive to warmth and lift than anything too bleak.",
            ],
            sig,
            "nuance_bright",
        )
    elif tone_gap <= -0.12:
        nuance = _pick(
            [
                "Tone-wise, you can handle darker material as long as the film earns it.",
                "You seem comfortable with shadow and tension when the movie commits to it.",
            ],
            sig,
            "nuance_dark",
        )
    elif g["energy"] >= 0.62 and g["intensity"] >= 0.58:
        nuance = _pick(
            [
                "Pacing can run a little hotter here, especially if the movie has real stakes.",
                "You seem ready for something with momentum, provided the tension feels earned.",
            ],
            sig,
            "nuance_hot",
        )
    elif g["energy"] <= 0.42 and g["comfort"] >= 0.55:
        nuance = _pick(
            [
                "A calmer, more controlled pace is likely to feel better than anything too loud.",
                "This reads like a steadier-night profile, with more room for mood than sheer force.",
            ],
            sig,
            "nuance_calm",
        )
    elif g["humor"] >= 0.60:
        nuance = _pick(
            [
                "A touch of wit will probably help the match feel more natural.",
                "Some lightness in the writing is likely to improve the fit.",
            ],
            sig,
            "nuance_wit",
        )
    else:
        nuance = _pick(
            [
                "Nothing here is overly narrow, so the right movie can flex a little without missing the mark.",
                "You are not boxed into one lane, which leaves room for range without losing fit.",
            ],
            sig,
            "nuance_balanced",
        )

    fit_by_style = {
        "explorer": [
            "The strongest matches are likely to be sharp, confident films that feel fresh without turning messy.",
            "The best fits are probably movies with momentum, clarity, and a less predictable edge.",
        ],
        "reflective": [
            "The strongest matches are likely to be grounded, character-led films with something real underneath.",
            "The best fits are probably thoughtful movies with emotional depth and a steady hand.",
        ],
        "edge": [
            "The strongest matches are likely to be tense, dark-leaning films that never soften the mood too much.",
            "The best fits are probably stories with pressure, atmosphere, and real emotional weight.",
        ],
        "brooding": [
            "The strongest matches are likely to be dark-leaning films with real substance beneath the surface.",
            "The best fits are probably movies that carry shadow, feeling, and a clear point of view.",
        ],
        "bright": [
            "The strongest matches are likely to be warm, lively films with heart and a little wit.",
            "The best fits are probably movies that feel inviting, sincere, and quietly fun to spend time with.",
        ],
        "atmospheric": [
            "The strongest matches are likely to be immersive films that build mood without losing substance.",
            "The best fits are probably movies you can really fall into, with texture, feeling, and a clear point of view.",
        ],
        "curious": [
            "The strongest matches are likely to be smart, emotionally grounded films that still avoid the obvious.",
            "The best fits are probably thoughtful picks that bring a fresh angle instead of a familiar one.",
        ],
        "warm": [
            "The strongest matches are likely to be sincere, reassuring films that still feel specific.",
            "The best fits are probably grounded movies with warmth, clarity, and an easy emotional payoff.",
        ],
    }

    if style in fit_by_style:
        fit_line = _pick(fit_by_style[style], sig, f"fit_{style}")
    else:
        fit_line = _pick(
            [
                f"The strongest matches are likely to bring {focus_nouns[top1]} without losing {focus_nouns[top2]}.",
                f"The best fits are probably movies that carry some {focus_nouns[top1]} while still leaving room for {focus_nouns[top2]}.",
            ],
            sig,
            f"fit_{top1}_{top2}",
        )

    return " ".join([lead, nuance, fit_line])



