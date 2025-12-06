import os
import csv
from typing import List, Dict, Tuple, Optional
import numpy as np

CSV_PATH = os.path.join(os.path.dirname(__file__), "playlist.csv")

def normalize(v: List[float]) -> np.ndarray:
    a = np.asarray(v, dtype=float)
    s = a.sum()
    return a / s if s > 0 else np.ones_like(a) / len(a)

def l2(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))

def load_songs(csv_path: Optional[str] = None) -> List[Dict]:
    path = csv_path or CSV_PATH
    songs: List[Dict] = []
    if not os.path.exists(path):
        raise FileNotFoundError(f"Playlist CSV not found: {path}")
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                vec = normalize([
                    float(row.get('emo_happy', 0)),
                    float(row.get('emo_sad', 0)),
                    float(row.get('emo_angry', 0)),
                    float(row.get('emo_calm', 0)),
                ])
            except Exception:
                vec = normalize([0.25, 0.25, 0.25, 0.25])
            songs.append({
                "id": row.get("song_id"),
                "title": row.get("title"),
                "artist": row.get("artist"),
                "uri": row.get("uri"),
                "vec": vec,
                "meta": row,
            })
    return songs

def recommend_top_n(
    current: List[float],
    target: List[float],
    n: int = 5,
    w: float = 0.5,
    method: str = "midpoint",
    csv_path: Optional[str] = None
) -> List[Dict]:
    """
    Recommend top-n songs from playlist.csv.
    - current: current state (imageAvg) 4-values
    - target: desired state (state.probs) 4-values
    - w: influence weight of a song (0..1). next = (1-w)*current + w*song_vec
    - method: 'midpoint' (minimize L2 after applying influence) or 'projection'
    Returns list of dicts: {score, id, title, artist, uri, vec}
    """
    songs = load_songs(csv_path)
    c = normalize(current)
    t = normalize(target)

    scored: List[Tuple[float, Dict]] = []
    for s in songs:
        sv = s["vec"]
        if method == "midpoint":
            next_state = (1.0 - w) * c + w * sv
            score = l2(next_state, t)  # lower better
        else:  # projection: higher alignment -> we negate to sort ascending
            move_to_target = t - c
            move_by_song = sv - c
            denom = (np.linalg.norm(move_to_target) * np.linalg.norm(move_by_song))
            score = -((move_to_target @ move_by_song) / denom) if denom > 0 else 0.0
        scored.append((score, s))

    # sort ascending (lower score = better)
    scored.sort(key=lambda x: x[0])
    out: List[Dict] = []
    for score, s in scored[:n]:
        out.append({
            "score": float(score),
            "song_id": s.get("id"),
            "title": s.get("title"),
            "artist": s.get("artist"),
            "uri": s.get("uri"),
            "vec": s.get("vec").tolist(),
        })
    return out

def recommend_greedy_playlist(
    current: List[float],
    target: List[float],
    steps: int = 3,
    w: float = 0.5,
    csv_path: Optional[str] = None
) -> List[Dict]:
    """
    Greedy multi-step playlist: choose best song each step, update current accordingly.
    Returns chosen songs (same dict format as recommend_top_n).
    """
    songs = load_songs(csv_path)
    c = normalize(current)
    t = normalize(target)
    chosen: List[Dict] = []
    available = songs.copy()

    for _ in range(steps):
        best = None
        best_score = float("inf")
        best_song = None
        for s in available:
            sv = s["vec"]
            next_state = (1.0 - w) * c + w * sv
            score = l2(next_state, t)
            if score < best_score:
                best_score = score
                best_song = s
        if best_song is None:
            break
        chosen.append({
            "score": float(best_score),
            "song_id": best_song.get("id"),
            "title": best_song.get("title"),
            "artist": best_song.get("artist"),
            "uri": best_song.get("uri"),
            "vec": best_song.get("vec").tolist(),
        })
        # update current and remove chosen from pool
        c = (1.0 - w) * c + w * best_song["vec"]
        available = [s for s in available if s.get("id") != best_song.get("id")]

    return chosen