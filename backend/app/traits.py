from typing import List, Dict
from typing import Dict

TRAIT_KEYS = [
    "darkness", "energy", "mood", "depth", "optimism",
    "novelty", "comfort", "intensity", "humor"
]

def _scale_num(x: float) -> float:
    try:
        v = float(x)
    except Exception:
        return 0.5
    if 0.0 <= v <= 1.0: return v
    if 1.0 <= v <= 5.0: return (v - 1.0) / 4.0
    if 0.0 <= v <= 100.0: return v / 100.0
    return max(0.0, min(1.0, v))

def answers_to_traits(answers: List[float]) -> Dict[str, float]:
    if not isinstance(answers, (list, tuple)) or len(answers) != 9:
        raise ValueError("answers must be a length-9 list/tuple of numbers")
    vals = [_scale_num(a) for a in answers]
    return {k: vals[i] for i, k in enumerate(TRAIT_KEYS)}

def summarize_traits(traits: Dict[str, float]) -> str:
    """
    Craft a friendly, slightly poetic summary that makes the user feel seen.
    Works off the same 9 traits: energy, mood, depth, optimism, novelty,
    comfort, intensity, humor, darkness.
    """
    # pull with defaults (robust to missing keys)
    g = {
        "energy":   float(traits.get("energy",   0.5)),
        "mood":     float(traits.get("mood",     0.5)),
        "depth":    float(traits.get("depth",    0.5)),
        "optimism": float(traits.get("optimism", 0.5)),
        "novelty":  float(traits.get("novelty",  0.5)),
        "comfort":  float(traits.get("comfort",  0.5)),
        "intensity":float(traits.get("intensity",0.5)),
        "humor":    float(traits.get("humor",    0.5)),
        "darkness": float(traits.get("darkness", 0.5)),
    }

    # ---------- Archetype (headline vibe) ----------
    archetype = "Beautifully Balanced"
    tagline   = "you appreciate a mix of tones and tempos"
    if g["energy"] > 0.66 and g["novelty"] > 0.62:
        archetype, tagline = "The Spark", "high-energy, curious, and up for something new"
    elif g["comfort"] > 0.66 and g["depth"] > 0.60:
        archetype, tagline = "The Cozy Thinker", "reflective and drawn to warm, thoughtful stories"
    elif g["intensity"] > 0.66 and g["darkness"] > 0.60:
        archetype, tagline = "The Edge Seeker", "bold with feelings and unafraid of the shadows"
    elif g["humor"] > 0.66 and g["novelty"] > 0.60:
        archetype, tagline = "The Lighthearted Adventurer", "playful, witty, and open to fresh twists"
    elif g["optimism"] > 0.70 and g["humor"] > 0.60:
        archetype, tagline = "The Warm Optimist", "you favor heart, hope, and clever charm"
    elif g["depth"] > 0.68 and g["mood"] < 0.55:
        archetype, tagline = "The Grounded Dreamer", "steady, thoughtful, and moved by meaning"

    # ---------- Today’s feel (short, immediate) ----------
    energy_word = "charged" if g["energy"] >= 0.60 else "calm"
    if abs(g["novelty"] - g["comfort"]) >= 0.12:
        tilt = "leaning toward novelty" if g["novelty"] > g["comfort"] else "leaning toward comfort"
    else:
        tilt = "open to either comfort or surprise"

    # ---------- What will land tonight (tone + pace + emotional weight) ----------
    tone_bits = []
    if g["humor"] >= 0.60: tone_bits.append("witty")
    if g["depth"] >= 0.60: tone_bits.append("introspective")
    if g["intensity"] >= 0.60: tone_bits.append("intense")
    if not tone_bits:
        tone_bits.append("easy-to-settle-into")

    pace  = "brisk" if g["energy"] >= 0.60 else "unhurried"
    weight = "emotionally full" if g["intensity"] >= 0.55 else "gentle"

    if g["optimism"] >= 0.60 and g["darkness"] < 0.55:
        brightness = "with a hope-forward glow"
    elif g["darkness"] >= 0.60:
        brightness = "with a shadow-tinged edge"
    else:
        brightness = "balanced between light and shade"

    # ---------- Assemble the message (3 clean sentences) ----------
    sent1 = f"You’re {archetype} — {tagline}."
    sent2 = f"Today you feel {energy_word}, {tilt}."
    sent3 = f"You’ll vibe with {', '.join(tone_bits)} stories that feel {pace} and {weight}, {brightness}."

    return " ".join([sent1, sent2, sent3])