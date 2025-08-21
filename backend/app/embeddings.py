from __future__ import annotations
from typing import List
import numpy as np
import os

class Embedder:
    def __init__(self, texts: List[str]):
        self.provider = os.getenv("EMBED_PROVIDER", "tfidf")
        if self.provider == "openai" and os.getenv("OPENAI_API_KEY"):
            from openai import OpenAI
            self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            self.model = os.getenv("EMBED_MODEL", "text-embedding-3-small")
            self.matrix = self._embed_openai(texts)
        else:
            self.provider = "tfidf"
            from sklearn.feature_extraction.text import TfidfVectorizer
            self.vec = TfidfVectorizer(max_features=4096, ngram_range=(1,2))
            self.matrix = self.vec.fit_transform(texts).astype(np.float32)

    def _embed_openai(self, texts: List[str]) -> np.ndarray:
        vecs = []
        for i in range(0, len(texts), 64):
            chunk = texts[i:i+64]
            resp = self.client.embeddings.create(model=self.model, input=chunk)
            vecs.extend([np.array(d.embedding, dtype=np.float32) for d in resp.data])
        return np.vstack(vecs)

    def encode(self, texts: List[str]):
        if self.provider == "openai":
            return self._embed_openai(texts)
        else:
            return self.vec.transform(texts).astype(np.float32)

    def cosine_topk(self, query_vec, k: int):
        from sklearn.metrics.pairwise import cosine_similarity
        sims = cosine_similarity(query_vec, self.matrix)[0]
        idxs = sims.argsort()[::-1][:k]
        return [(int(i), float(sims[i])) for i in idxs]
