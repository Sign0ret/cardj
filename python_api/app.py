from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import threading
import os
import sys
import image_emotion_detector

# import local module (gemini_emotion_detection.py is in the same folder)
from gemini_emotion_detection import FurhatDrivingAssistant
from recommender import recommend_top_n

app = FastAPI()
assistant = FurhatDrivingAssistant()
detector = image_emotion_detector.ImageEmotionDetector()

# en entorno de desarrollo permite el frontend (o usa ["*"] temporalmente)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # ajustar a tu dev host
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []
    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
    async def broadcast(self, message: dict):
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.disconnect(d)

manager = ConnectionManager()

# schedule broadcasts from assistant
def _on_update(payload: dict):
    """
    Thread-safe: schedule manager.broadcast on the main event loop.
    Broadcast a combined payload with both assistant and image detector states so
    the frontend receives both in one message.
    """
    loop = getattr(manager, "loop", None)
    combined = {"assistant": payload, "image": detector.get_state()}
    if loop is None:
        # fallback: try to get running loop (if called from an async context)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

    if loop:
        try:
            asyncio.run_coroutine_threadsafe(manager.broadcast(combined), loop)
        except Exception as e:
            print("Failed to schedule broadcast:", e, file=sys.stderr)
    else:
        # best-effort: if we somehow are in the event loop, create a task
        try:
            asyncio.create_task(manager.broadcast(combined))
        except Exception as e:
            print("No loop available to broadcast:", e, file=sys.stderr)

assistant.on_update = _on_update

@app.get("/emotion")
def get_emotion():
    return assistant.get_emotion_state()

@app.websocket("/ws/emotion")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # send combined state immediately
        await websocket.send_json({
            "assistant": assistant.get_emotion_state(),
            "image": detector.get_state()
        })
        while True:
            # keep connection alive; clients don't need to send
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

def terminal_repl_loop(assistant: FurhatDrivingAssistant):
    print("Terminal REPL started. Commands: ask | msg:<text> | confirmmsg:<text> | quit")
    try:
        while True:
            try:
                line = input("> ").strip()
            except EOFError:
                break
            if not line:
                continue
            if line == "quit":
                print("Terminal REPL exiting.")
                break
            if line == "ask":
                # runs interactive flow (will prompt for Driver: inputs)
                try:
                    assistant.ask_mood()
                except Exception as e:
                    print("ask_mood error:", e, file=sys.stderr)
                continue
            if line.startswith("msg:"):
                text = line[len("msg:"):].strip()
                try:
                    state = assistant.receive_user_text(text, confirm=False)
                    print("Updated state:", state)
                except Exception as e:
                    print("receive_user_text error:", e, file=sys.stderr)
                continue
            if line.startswith("confirmmsg:"):
                text = line[len("confirmmsg:"):].strip()
                try:
                    state = assistant.receive_user_text(text, confirm=True)
                    print("Updated state:", state)
                except Exception as e:
                    print("receive_user_text(confirm) error:", e, file=sys.stderr)
                continue
            print("Unknown command. Use: ask | msg:<text> | confirmmsg:<text> | quit")
    except Exception as e:
        print("Terminal REPL fatal error:", e, file=sys.stderr)

# new endpoints to trigger image capture and read history
class CaptureResponse(BaseModel):
    image_state: dict

@app.post("/capture-image")
async def capture_image():
    """
    Trigger an image capture (fake for now). Returns the image state and broadcasts
    the combined payload to WS clients.
    """
    img_state = detector.capture_fake()
    combined = {"assistant": assistant.get_emotion_state(), "image": img_state}
    # broadcast in current event loop
    await manager.broadcast(combined)
    return {"image_state": img_state}

@app.get("/image-history")
async def image_history():
    return detector.get_state()

@app.on_event("startup")
async def startup_event():
    # store the running loop so other threads (REPL) can schedule coroutines
    manager.loop = asyncio.get_running_loop()
    # existing startup behavior (if any)...
    if os.environ.get("ENABLE_TERMINAL_INPUT", "0") == "1":
        t = threading.Thread(target=terminal_repl_loop, args=(assistant,), daemon=True)
        t.start()

class RecommendRequest(BaseModel):
    current: List[float]
    target: List[float]
    n: int = 5
    w: float = 0.5
    method: str = "midpoint"

@app.post("/recommend")
async def recommend(req: RecommendRequest):
    # usar playlist.csv que está al lado de este módulo
    csv_path = os.path.join(os.path.dirname(__file__), "playlist.csv")
    # llamamos a recommend_top_n(current, target, n, w, method, csv_path)
    results = recommend_top_n(req.current, req.target, req.n, req.w, req.method, csv_path)
    # la función ya devuelve lista de dicts con los campos útiles
    return {"results": results}