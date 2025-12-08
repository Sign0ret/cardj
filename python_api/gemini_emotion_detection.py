import random
from google import genai
import os
from google.genai import types
import re
import numpy as np
import json
from furhat_remote_api import FurhatRemoteAPI
import typing
import asyncio
import sys

API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyAlKkal-Lsg57jylWDzMhpvzylFzjCRzoU")  # Paste your API key here
furhat = FurhatRemoteAPI("localhost")

import random

class FurhatDrivingAssistant:
    RULES = {
        "yes": True,
        "yeah": True,
        "exactly": True,
        "no": False,
        "not really": False,
        "nope": False,
        "I don't think so": False,
        "maybe not": False,
        "maybe": False,
    }

    extend_questions = [
        "How’s your day going so far?",
        "Has anything interesting happened today?",
        "What are you up to right now?",
        "Did you have a good morning?",
        "How’s the traffic today?",
        "Any plans for the rest of the day?",
        "What did you do before starting the drive?",
        "Have you tried anything new recently?",
        "Is today going as expected so far?",
        "Did anything unexpected happen today?",
        "Have you been busy today?",
        "Any highlights from today so far?",
        "Are you doing anything different today than usual?",
        "Have you talked to anyone interesting today?",
        "Is your day going faster or slower than usual?",
    ]

    questions = {
        "happy": [
            "Anything good happen today?",
            "Made you smile recently?",
            "Looking forward to something today?",
            "Feeling pretty cheerful now?"
        ],
        "calm": [
            "Feeling relaxed on the drive?",
            "Is it a chill kind of day?",
            "Everything going smoothly?",
            "Feeling calm right now?"
        ],
        "angry": [
            "Traffic bothering you?",
            "Feeling annoyed about anything?",
            "Something bugging you today?",
            "Feeling a bit irritated?"
        ],
        "sad": [
            "Feeling a bit down today?",
            "Anything on your mind?",
            "Having a rough day?",
            "Feeling low at the moment?"
        ]
    }

    def __init__(self):
        # keep probs as a numpy array consistently
        self.emotion_probs = np.array([0.25, 0.25, 0.25, 0.25])
        self.emotion_labels = ["happy", "sad", "angry", "calm"]
        self.main_emotion = "happy"
        self.furhat = FurhatRemoteAPI("localhost")
        self.furhat_remote_api_on = True # debug mode (if virtual robot is not connected)
        self.on_update: typing.Optional[typing.Callable[[dict], None]] = None
        self.init_gemini() # set instruction prompt

    def init_gemini(self):
        self.client = genai.Client(api_key=API_KEY)
        self.chat = self.client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction="You're job is detecting the emotion of driver based on your conversation." \
                "In the end, reply a possibility of emotion(happy, calm, angry, sad). For example, when the driver says I had a bad day " \
                "then the possibility might by [happy, calm, angry, sad] = [0.1, 0.3, 0.2, 0.4]. Return in jason format with name emotion_possibility" 
            )
        )


    # 主動詢問駕駛心情
    def ask_mood(self):
        question = "How do you feel today?" #First question
        print("Furhat:", question)

        if self.furhat_remote_api_on:
            user_response = furhat.listen()
            user_response = user_response.message.lower()  # normalize response
        else:
            user_response = input("Driver: ") # debug mode
        print("Driver:", user_response)
        geminiResponse = self.chat.send_message([user_response]).text.strip()
        self.emotion_analysis(geminiResponse)
        print("(Furhat emotion detection:", self.main_emotion, ")")
        # furhat.say(text = response, blocking = True) # Fix untill furhat can be connected successfully
        return self.main_emotion

    def emotion_analysis(self, geminiResponse):
        # input: genimi response - json format
        # output: main emotion - str
    
        # first analysis
        self.get_main_emotion(geminiResponse)
        # Emotion confirmation and check if extend conversion is needed.
        self.confirm_emotion(self.main_emotion)
        # Notify Emotion result

        # notify any listener (convert numpy -> python types)
        self._notify_update()

    def _notify_update(self):
        if not self.on_update:
            return
        try:
            payload = self.get_emotion_state()
            result = self.on_update(payload)
            # if the callback returned a coroutine (or is async), schedule it
            if asyncio.iscoroutine(result):
                asyncio.create_task(result)
        except Exception as e:
            # don't crash the assistant on notify failures; log for debug
            print("notify_update error:", e, file=sys.stderr)

    def get_emotion_state(self) -> dict:
        probs = self.emotion_probs
        # support both numpy arrays and plain lists
        if hasattr(probs, "tolist"):
            probs_list = probs.tolist()
        else:
            probs_list = list(probs)
        return {
            "labels": list(self.emotion_labels),
            "probs": probs_list,
            "main": self.main_emotion
        }

    def confirm_emotion(self, main_emotion):
        question = "Do you feel " + main_emotion + " today?"
        print("Furhat: ", question)

        if self.furhat_remote_api_on:
            response = furhat.listen()
            response = response.message.lower()  # normalize response
        else:
            response = input("Driver: ").lower()
        print("Driver:", response)
    
        if not self.user_agrees(question, response): # Driver disagree with the emotion analysis
            self.extend_conversation()

    def extend_conversation(self):
        # input: none
        # output: none
        # get main emotion based on conversations


        # Q1:print("Furhat: Q1:")
        question1 = random.choice(self.extend_questions)
        print(question1)
        if self.furhat_remote_api_on:
            user_response1 = furhat.listen().message
        else:
            user_response1 = input("Driver:").lower() # debug mode
        print("Driver:", user_response1)
        # Q2:print("Furhat: Q2:")
        question2 = random.choice(self.extend_questions)
        print(question2)
        if self.furhat_remote_api_on:
            user_response2 = furhat.listen().message
        else:
            user_response2 = input("Driver:").lower() # debug mode
        print("Driver:", user_response2)

        conversation1 = "Question1: " + question1 + " Response1: " + user_response1
        conversation2 = "Question2: " + question2 + " Response2: " + user_response2
        # print(conversation1 + conversation2)
        geminiResponse = self.chat.send_message([conversation1 + conversation2]).text.strip()

        self.get_main_emotion(geminiResponse)
        
    def get_main_emotion(self, geminiResponse):
        
        # json to dict
        json_str = re.search(r"\{[\s\S]*\}", geminiResponse).group(0)
        data = json.loads(json_str) # data = "emotion_possibility": {"happy": 0.2,"calm": 0.3,"angry": 0.1,"sad": 0.5}

        self.emotion_probs = np.array(list(data["emotion_possibility"].values()))
        self.emotion_labels = list(data["emotion_possibility"].keys())

        # get main emotion
        maxidx = np.argmax(self.emotion_probs)
        self.main_emotion = self.emotion_labels[maxidx]
        
    def user_agrees(self, question: str, response: str) -> bool:
        """
        input: question, response
        output: boolean
        """
        normalized_reply = response.strip().lower()

        # rule-based check
        rule_result = self.RULES.get(normalized_reply, None) # return None if there's no result

        if rule_result is not None:
            print("Return rule-based result", end=' ')
            return rule_result
        else:
            llm_result = self._llm_check(question, response)
            return llm_result
    
    def _llm_check(self, question, response):
        client = genai.Client(api_key=API_KEY)
        chat = client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction="You are a classifier. Check if the response agree with the question." \
                "If yes, return True. If not return False"
            )
        )

        conversation = "Question: " + question + " Response: " + response
        geminiResponse = self.chat.send_message([conversation]).text.strip()


    
if __name__ == "__main__":
    assistant = FurhatDrivingAssistant()
    assistant.ask_mood()
