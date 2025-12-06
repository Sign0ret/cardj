import numpy as np
from typing import List

class ImageEmotionDetector:
    """
    Independent image-emotion detector stub.
    capture_fake() simulates taking a photo and returns a normalized 4-value vector.
    Stores only:
      - last_probs: most recent capture (4 values)
      - running_avg: running average of every capture so far (4 values)
      - count: number of captures included in running_avg (int)
    """

    def __init__(self, labels: List[str] | None = None):
        self.labels = labels or ["happy", "sad", "angry", "calm"]
        # most recent capture
        self.last_probs = np.array([0.0, 0.0, 0.0, 0.0], dtype=float)
        # running average of captures
        self.running_avg = np.array([0.0, 0.0, 0.0, 0.0], dtype=float)
        # number of captures included in running_avg
        self.count = 0

    def capture_fake(self) -> dict:
        """
        Simulate a capture, update last_probs and running_avg/count, and return state.
        """
        r = np.random.random(4)
        s = r.sum() if r.sum() > 0 else 1.0
        r = r / s
        self.last_probs = r

        # update running average incrementally
        prev_count = self.count
        self.count = prev_count + 1
        self.running_avg = (self.running_avg * prev_count + r) / self.count

        return self.get_state()

    def get_state(self) -> dict:
        """
        Return a compact state: labels, most recent probs, running average and count.
        """
        return {
            "labels": list(self.labels),
            "probs": self.last_probs.tolist(),
            "running_avg": self.running_avg.tolist(),
            "count": int(self.count),
        }