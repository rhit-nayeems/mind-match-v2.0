from math import sqrt
from typing import Dict

TRAIT_KEYS = [
    "energy", "mood", "depth", "optimism", "novelty",
    "comfort", "intensity", "humor", "darkness"
]

def cosine(a: Dict[str, float], b: Dict[str, float]) -> float:
    num = 0.0
    den1 = 0.0
    den2 = 0.0
    for k in TRAIT_KEYS:
        av = a.get(k, 0.0); bv = b.get(k, 0.0)
        num += av * bv
        den1 += av * av
        den2 += bv * bv
    if den1 == 0 or den2 == 0:
        return 0.0
    return num / (sqrt(den1) * sqrt(den2))
