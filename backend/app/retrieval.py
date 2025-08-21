from typing import List, Dict, Tuple
from .embeddings import Embedder

def build_corpus(movies: List[dict]) -> List[str]:
    docs = []
    for m in movies:
        txt = f"{m.get('title','')} {m.get('year','')} {m.get('synopsis','')}"
        docs.append(txt)
    return docs

class Retriever:
    def __init__(self, movies: List[dict]):
        self.movies = movies
        self.docs = build_corpus(movies)
        self.embedder = Embedder(self.docs)

    def query_topk(self, query_text: str, k: int = 30) -> List[Tuple[int, float]]:
        qv = self.embedder.encode([query_text])
        return self.embedder.cosine_topk(qv, k)

def traits_to_prompt(traits: Dict[str,float]) -> str:
    bits = []
    for k, v in traits.items():
        if v > 0.62: bits.append(f"more {k}")
        elif v < 0.38: bits.append(f"less {k}")
    return "movies that are " + ", ".join(bits) if bits else "balanced mood movies"
