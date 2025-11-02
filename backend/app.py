from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from contextlib import suppress
from pathlib import Path
from typing import Any

import dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK

from .services.gemini_session import GeminiSession
from .services.tts_client import TTSClient
from .utils import calculate_pronunciation_score

dotenv.load_dotenv()

logger = logging.getLogger("gemini_teacher.app")
if not logging.getLogger().handlers:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise RuntimeError("Missing GOOGLE_API_KEY environment variable")

HTTP_PROXY = os.environ.get("HTTP_PROXY")
HOST = os.getenv("GEMINI_HOST", "generativelanguage.googleapis.com")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")
GEMINI_MODEL = MODEL_NAME if MODEL_NAME.startswith("models/") else f"models/{MODEL_NAME}"

VOICE_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "nPczCjzI2devNBz1zQrb")
VOICE_MODEL = os.getenv("ELEVENLABS_VOICE_MODEL", "eleven_flash_v2_5")

THEMES: dict[str, list[str]] = {
    "business": ["job interview", "business meeting", "presentation", "networking"],
    "travel": ["airport", "hotel", "restaurant", "sightseeing"],
    "daily life": ["shopping", "weather", "hobbies", "family"],
    "social": ["meeting friends", "party", "social media", "dating"],
}

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = Path(__file__).resolve().parents[1] / "frontend"


@app.on_event("startup")
async def _init_clients() -> None:
    app.state.tts_client = TTSClient(
        api_key=VOICE_API_KEY,
        voice_id=VOICE_ID,
        model_id=VOICE_MODEL,
    )


@app.get("/api/themes")
async def get_themes() -> JSONResponse:
    return JSONResponse(THEMES)


async def _forward_gemini_events(
    *,
    session: GeminiSession,
    websocket: WebSocket,
    tts_client: TTSClient,
) -> None:
    logger.debug("Begin forwarding Gemini events to %s", websocket.client)
    try:
        async for event in session.events():
            if event.type == "text-delta" and event.text:
                logger.debug("Forwarding text delta (%d chars)", len(event.text))
                await websocket.send_json({"type": "partial-response", "text": event.text})
            elif event.type == "turn-complete":
                payload: dict[str, Any] = {
                    "type": "final-response",
                    "text": event.text,
                    "paused": event.paused,
                }
                audio_bytes = session.reset_audio_buffer()
                if audio_bytes:
                    logger.debug("Calculated pronunciation score from %d audio bytes", len(audio_bytes))
                    payload["score"] = calculate_pronunciation_score(audio_bytes)
                english_text = ""
                if event.text:
                    english_text = event.text.split("---")[0].strip()
                if english_text and tts_client.enabled and not event.paused:
                    audio_b64 = await tts_client.synthesize(english_text)
                    if audio_b64:
                        payload["audio"] = audio_b64
                await websocket.send_json(payload)
                await websocket.send_json({"type": "pause-state", "paused": event.paused})
                logger.info("Delivered final response to client %s (paused=%s)", websocket.client, event.paused)
    except ConnectionClosedOK as exc:
        logger.info(
            "Gemini connection closed gracefully: code=%s reason=%s",
            exc.code,
            exc.reason,
        )
        with suppress(Exception):
            await websocket.send_json(
                {
                    "type": "gemini-disconnected",
                    "code": exc.code,
                    "reason": exc.reason,
                }
            )
    except ConnectionClosedError as exc:
        logger.warning(
            "Gemini connection closed unexpectedly: code=%s reason=%s",
            exc.code,
            exc.reason,
        )
        with suppress(Exception):
            await websocket.send_json(
                {
                    "type": "gemini-disconnected",
                    "code": exc.code,
                    "reason": exc.reason,
                }
            )
        raise RuntimeError(f"Gemini connection closed: {exc.code} {exc.reason}") from exc
    except Exception:
        logger.exception("Unhandled error while forwarding Gemini events")
        raise
    finally:
        logger.debug("Finished forwarding Gemini events for %s", websocket.client)


async def _forward_client_messages(
    *,
    session: GeminiSession,
    websocket: WebSocket,
) -> None:
    while True:
        message = await websocket.receive()
        message_type = message.get("type")
        if message_type == "websocket.disconnect":
            logger.info("Client requested websocket disconnect: %s", websocket.client)
            raise WebSocketDisconnect()
        if "text" in message and message["text"] is not None:
            data = json.loads(message["text"])
            msg_type = data.get("type")
            logger.debug("Received client message type=%s", msg_type)
            if msg_type == "audio-chunk" and "data" in data:
                logger.debug("Streaming audio chunk from client (len=%d)", len(data["data"]))
                await session.send_audio_chunk(base64_chunk=data["data"])
            elif msg_type == "end-turn":
                logger.info("Client marked end of turn")
                await session.end_user_turn()
            elif msg_type == "preference":
                theme = data.get("theme")
                scenario = data.get("scenario")
                if theme and scenario:
                    preference_text = (
                        "I'd like to practice the {theme} theme focusing on the {scenario} scenario.".format(
                            theme=theme, scenario=scenario
                        )
                    )
                    logger.info("Updating practice preference to theme=%s scenario=%s", theme, scenario)
                    await session.send_user_text(preference_text)
            elif msg_type == "start-practice":
                theme = data.get("theme")
                scenario = data.get("scenario")
                logger.info(
                    "Starting new practice round for client %s (theme=%s scenario=%s)",
                    websocket.client,
                    theme,
                    scenario,
                )
                session.paused = False
                session.reset_audio_buffer()
                if theme and scenario:
                    friendly_target = f"{theme} - {scenario}"
                elif theme:
                    friendly_target = theme
                elif scenario:
                    friendly_target = scenario
                else:
                    friendly_target = "练习内容"
                with suppress(Exception):
                    await websocket.send_json(
                        {
                            "type": "status",
                            "message": f"AI 正在准备 {friendly_target} 的练习句子…",
                        }
                    )
                await session.request_practice_sentence(theme=theme, scenario=scenario)
            elif msg_type == "control":
                action = data.get("action")
                if action == "resume":
                    logger.info("Client resumed session")
                    session.paused = False
                elif action == "pause":
                    logger.info("Client paused session")
                    session.paused = True
        elif "bytes" in message and message["bytes"] is not None:
            logger.debug("Received binary audio chunk from client (%d bytes)", len(message["bytes"]))
            await session.send_audio_chunk(base64_chunk=base64.b64encode(message["bytes"]).decode())


@app.websocket("/ws/conversation")
async def websocket_conversation(websocket: WebSocket) -> None:
    await websocket.accept()
    tts_client: TTSClient = app.state.tts_client
    await websocket.send_json({"type": "status", "message": "connected"})
    if tts_client.enabled:
        await websocket.send_json({"type": "status", "message": "voice-enabled"})
    else:
        await websocket.send_json({"type": "status", "message": "voice-disabled"})

    try:
        async with GeminiSession(
            model=GEMINI_MODEL,
            api_key=GOOGLE_API_KEY,
            host=HOST,
            proxy_url=HTTP_PROXY,
        ) as session:
            forward_gemini = asyncio.create_task(
                _forward_gemini_events(session=session, websocket=websocket, tts_client=tts_client)
            )
            forward_client = asyncio.create_task(
                _forward_client_messages(session=session, websocket=websocket)
            )
            done, pending = await asyncio.wait(
                {forward_gemini, forward_client}, return_when=asyncio.FIRST_EXCEPTION
            )
            for task in pending:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            for task in done:
                if task.exception():
                    raise task.exception()
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # pragma: no cover - runtime safety
        with suppress(Exception):
            await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011, reason=str(exc))


@app.get("/health")
async def healthcheck() -> JSONResponse:
    return JSONResponse({"status": "ok"})


app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
