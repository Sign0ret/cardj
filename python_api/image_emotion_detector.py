"""
Image emotion detector wrapper ported from image_recognition_system.ipynb
Provides:
 - ImageEmotionDetector: reuseable detector class
 - detect_from_path(path) -> np.ndarray([happy, neutral, angry, sad]) (normalized)
 - detect_from_array(img_array) -> list[np.ndarray] for multiple faces
"""
from typing import List
import numpy as np
import cv2
from fer.fer import FER
import os
import random

# Initialize detector once (reuse for all calls)
# mtcnn disabled for Python 3.12 compatibility if needed
_detector = FER(mtcnn=False)
_FIXED_ORDER = ["happy", "neutral", "angry", "sad"]

def get_image():
    cam = cv2.VideoCapture(0)
    # Define the codec and create VideoWriter object
    ret, frame = cam.read()
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    # plt.imshow(image, cmap='gray')
    # plt.show()
    cv2.destroyAllWindows()
    return image

def _normalize_probs(arr: np.ndarray) -> np.ndarray:
    arr = np.array(arr, dtype=float)
    s = arr.sum()
    if s > 0:
        return arr / s
    return arr


def detect_from_path(img_path: str) -> np.ndarray:
    img = cv2.imread(img_path)
    # img = get_image()
    if img is None:
        raise FileNotFoundError(f"Image not found: {img_path}")

    results = _detector.detect_emotions(img)
    if not results:
        return np.array([0.0, 0.0, 0.0, 0.0])

    em = results[0]["emotions"]
    arr = np.array([em.get(k, 0.0) for k in _FIXED_ORDER], dtype=float)
    return _normalize_probs(arr)


def detect_from_array(img_array: np.ndarray) -> List[np.ndarray]:
    if img_array is None or getattr(img_array, "size", 0) == 0:
        return []

    results = _detector.detect_emotions(img_array)
    if not results:
        return []

    out = []
    for res in results:
        em = res.get("emotions", {})
        arr = np.array([em.get(k, 0.0) for k in _FIXED_ORDER], dtype=float)
        out.append(_normalize_probs(arr))
    return out


class ImageEmotionDetector:
    """
    Backwards-compatible class wrapper.
    Usage:
      detector = ImageEmotionDetector()
      probs = detector.detect_from_path("img.jpg")  # numpy array
      faces = detector.detect_from_array(img_array) # list of numpy arrays
      detector.labels -> list of labels in fixed order
    """
    def __init__(self, mtcnn: bool = False):
        # reuse the module-level detector for efficiency
        self._detector = _detector
        self.labels = list(_FIXED_ORDER)
        # store last detected state so get_state() can return real results
        self._last_state = {"labels": self.labels, "probs": [0.0] * len(self.labels), "source": None}

    def detect_from_path(self, img_path: str) -> np.ndarray:
        arr = detect_from_path(img_path)
        # update last state for callers that rely on instance state
        self._last_state = {"labels": self.labels, "probs": arr.tolist(), "source": img_path}
        return arr

    def detect_from_array(self, img_array: np.ndarray) -> List[np.ndarray]:
        arrs = detect_from_array(img_array)
        if arrs:
            # store first face as last state
            self._last_state = {"labels": self.labels, "probs": arrs[0].tolist(), "source": "array"}
        return arrs

    def get_state_for_first_face(self, img_path: str) -> dict:
        arr = self.detect_from_path(img_path)
        return {"labels": self.labels, "probs": arr.tolist()}

    def get_state(self) -> dict:
        """
        Return last known detection state (labels, probs, source).
        """
        return self._last_state

    def capture_random_from_dataset(self) -> dict:
        """
        Pick a random real image from python_api/dataset/images, run detection and
        return the state. Raises FileNotFoundError if no images found.
        """
        base = os.path.dirname(__file__)
        dataset_dir = os.path.join(base, "dataset", "images")
        if not os.path.isdir(dataset_dir):
            raise FileNotFoundError(f"Dataset directory not found: {dataset_dir}")

        imgs = [f for f in os.listdir(dataset_dir) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
        if not imgs:
            raise FileNotFoundError(f"No image files found in: {dataset_dir}")

        choice = random.choice(imgs)
        path = os.path.join(dataset_dir, choice)
        probs = self.detect_from_path(path).tolist()  # detect_from_path updates self._last_state
        state = {"labels": self.labels, "probs": probs, "source": path}
        self._last_state = state
        return state


# simple CLI/testing entrypoint (keeps non-blocking behavior for imports)
if __name__ == "__main__":
    import time

    dataset_folder = "./dataset/images"
    if not os.path.isdir(dataset_folder):
        print("Dataset folder not found:", dataset_folder)
        raise SystemExit(1)

    image_files = [f for f in os.listdir(dataset_folder) if f.lower().endswith(".jpg")]
    if not image_files:
        print("No .jpg images found in", dataset_folder)
        raise SystemExit(1)

    max_duration = 60
    start_time = time.time()
    while time.time() - start_time < max_duration:
        img_file = random.choice(image_files)
        img_path = os.path.join(dataset_folder, img_file)
        img_array = cv2.imread(img_path)
        if img_array is None:
            print("Failed to load", img_file)
            continue
        emotions_per_face = detect_from_array(img_array)
        if emotions_per_face:
            for i, em in enumerate(emotions_per_face):
                print(f"{img_file} - Face {i+1}: {em}")
        else:
            print(f"{img_file} - No faces detected")
        print("--- Waiting 10 seconds for next image ---\n")
        time.sleep(10)