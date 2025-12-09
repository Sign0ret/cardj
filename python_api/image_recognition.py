import cv2
import os
import time
import random
import numpy as np
from matplotlib import pyplot as plt
from fer.fer import FER

detector = FER(mtcnn=False)

def get_emotions_from_array_multi():
    img_array = get_image()
    if img_array is None or img_array.size == 0:
        return []

    results = detector.detect_emotions(img_array)
    if not results:
        return []

    emotion_arrays = []
    fixed_order = ["happy", "neutral", "angry", "sad"]

    for res in results:
        em = res["emotions"]
        emotions_array = np.array([em[e] for e in fixed_order])
        if emotions_array.sum() > 0:
            emotions_array = emotions_array / emotions_array.sum()
        emotion_arrays.append(emotions_array)

    return emotion_arrays

def get_image():
    cam = cv2.VideoCapture(0)
    # Define the codec and create VideoWriter object
    ret, frame = cam.read()
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    plt.imshow(image, cmap='gray')
    plt.show()
    return image

if __name__ == "__main__":
    get_emotions_from_array_multi()
    