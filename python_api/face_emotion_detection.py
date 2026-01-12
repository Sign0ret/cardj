import os
import torch
import torch.nn as nn
from torchvision import datasets, transforms
from torch.utils.data import DataLoader
from torchvision import models
from torchvision import transforms
import random
import time
from PIL import Image
import numpy as np
import cv2
import matplotlib.pyplot as plt



class FaceDetection:
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        self.model = models.resnet18(weights=None)
        self.model.fc = nn.Linear(self.model.fc.in_features, 7)  # FER model is 7 class

        self.model.load_state_dict(torch.load(r"C:\Users\yu\Downloads/resnet_fer2013_er.pth", map_location=self.device))
        self.model = self.model.to(self.device)

        self.transform = transforms.Compose([
            transforms.Grayscale(num_output_channels=3),  # for ResNet (expects 3-channel input)
            transforms.Resize((224, 224)),                # For ResNet
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.5, 0.5, 0.5],
                                std=[0.5, 0.5, 0.5])
        ])


        self.fer_classes = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]

        self.our_emotions = ["angry", "sad", "neutral", "happy"]

        self.map_7_to_4 = {
            "angry": "angry",
            "disgust": "angry",
            "fear": "sad",
            "sad": "sad",
            "neutral": "neutral",
            "happy": "happy",
            "surprise": "happy"
        }
        self.cam = cv2.VideoCapture(0)

    def predict_emotion_array(self):
        img_RGB = self.get_webcam_image_pil()
        image = self.transform(img_RGB).unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(image)
            probs_7 = torch.softmax(logits, dim=1).cpu().numpy()[0]

        # Convert 7-class probs to 4-class probs
        probs_4 = np.zeros(len(self.our_emotions))

        for i, fer_emotion in enumerate(self.fer_classes):
            target_emotion = self.map_7_to_4[fer_emotion]
            idx = self.our_emotions.index(target_emotion)
            probs_4[idx] += probs_7[i]
        plt.imshow(img_RGB)
        plt.title(probs_4)
        return probs_4
    def get_webcam_image_pil(self):
        # while True:
        ret, frame = self.cam.read()

        print('capture')
        # Display the captured frame
        cv2.imshow('Camera', frame)
        pil_img = Image.fromarray(frame)
        # Press 'q' to exit the loop
        # if cv2.waitKey(1) == ord('q'):
        #     break
        
        return pil_img

if __name__ == "__main__":
    assistant = FaceDetection()
    emotion = assistant.predict_emotion_array()
    print(emotion)

