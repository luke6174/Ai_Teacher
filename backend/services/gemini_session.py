from __future__ import annotations

import asyncio
import base64
import json
import logging
from contextlib import suppress
from dataclasses import dataclass
from typing import AsyncGenerator, Optional

from websockets.asyncio.client import connect
from websockets.asyncio.connection import Connection
from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK
from websockets.legacy.client import WebSocketClientProtocol
from websockets_proxy import Proxy, proxy_connect


logger = logging.getLogger(__name__)
KEEPALIVE_INTERVAL_SECONDS = 15


@dataclass
class GeminiEvent:
    """Represents a parsed event emitted from Gemini."""

    type: str
    text: Optional[str] = None
    paused: Optional[bool] = None


class GeminiSession:
    """Manages the lifecycle of a Gemini streaming session."""

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        host: str = "generativelanguage.googleapis.com",
        proxy_url: str | None = None,
    ) -> None:
        self._model = model
        self._api_key = api_key
        self._host = host
        self._proxy_url = proxy_url
        self._ws: Connection | WebSocketClientProtocol | None = None
        self._ws_cm = None
        self.paused = False
        self._audio_buffer: bytearray = bytearray()
        self._keepalive_task: asyncio.Task[None] | None = None

    @property
    def uri(self) -> str:
        return (
            f"wss://{self._host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService"
            f".BidiGenerateContent?key={self._api_key}"
        )

    async def __aenter__(self) -> "GeminiSession":
        proxy: Optional[Proxy] = Proxy.from_url(self._proxy_url) if self._proxy_url else None
        self._ws_cm = proxy_connect(self.uri, proxy=proxy) if proxy else connect(self.uri)
        self._ws = await self._ws_cm.__aenter__()
        logger.info("Gemini websocket connected to %s", self.uri)
        await self._send_setup()
        await self._send_initial_prompt()
        self._start_keepalive()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # pragma: no cover - cleanup logic
        await self._stop_keepalive()
        if self._ws_cm:
            await self._ws_cm.__aexit__(exc_type, exc, tb)
        logger.info("Gemini websocket disconnected")
        self._ws_cm = None
        self._ws = None

    async def _send(self, payload: dict) -> None:
        if not self._ws:
            raise RuntimeError("Gemini session is not initialized")
        logger.debug("Sending payload to Gemini: %s", list(payload.keys()))
        await self._ws.send(json.dumps(payload))

    async def _send_setup(self) -> None:
        setup_msg = {
            "setup": {
                "model": self._model,
                "generation_config": {"response_modalities": ["TEXT"]},
            }
        }
        await self._send(setup_msg)
        # Consume acknowledgement
        if self._ws is None:
            return
        await self._ws.recv()
        logger.debug("Received setup acknowledgement from Gemini")

    async def _send_initial_prompt(self) -> None:
        initial_msg = {
            "client_content": {
                "turns": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "text": (
                                    "你是一名专业的英语口语指导老师。请用中英文双语进行回复，英文在前中文在后，用 --- 分隔。\n\n"
                                    "Your responsibilities are:\n"
                                    "1. Help users correct grammar and pronunciation\n"
                                    "2. Give pronunciation scores and detailed feedback\n"
                                    "3. Understand and respond to control commands:\n"
                                    "   - Pause when user says \"Can I have a break\"\n"
                                    "   - Continue when user says \"OK let's continue\"\n"
                                    "4. Provide practice sentences based on chosen themes and scenarios\n\n"
                                    "你的职责是：\n"
                                    "1. 帮助用户纠正语法和发音\n"
                                    "2. 给出发音评分和详细反馈\n"
                                    "3. 理解并响应用户的控制指令：\n"
                                    "   - 当用户说\"Can I have a break\"时暂停\n"
                                    "   - 当用户说\"OK let's continue\"时继续\n"
                                    "4. 基于选择的主题和场景提供练习句子\n\n"
                                    "First, ask which theme they want to practice (business, travel, daily life, social) in English.\n\n"
                                    "每次用户说完一个句子后，你需要：\n"
                                    "1. 识别用户说的内容（英文）\n"
                                    "2. 给出发音评分（0-100分）\n"
                                    "3. 详细说明发音和语法中的问题（中英文对照）\n"
                                    "4. 提供改进建议（中英文对照）\n"
                                    "5. 提供下一个相关场景的练习句子（中英文对照）\n\n"
                                    "请始终保持以下格式：\n"
                                    "[English content]\n---\n[中文内容]\n\n"
                                    "如果明白了请用中英文回答OK"
                                )
                            }
                        ],
                    }
                ],
                "turn_complete": True,
            }
        }
        await self._send(initial_msg)

    def _start_keepalive(self) -> None:
        if self._keepalive_task or not self._ws:
            return
        self._keepalive_task = asyncio.create_task(self._keepalive_loop(), name="gemini_keepalive")

    async def _stop_keepalive(self) -> None:
        task = self._keepalive_task
        if not task:
            return
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        self._keepalive_task = None

    async def _keepalive_loop(self) -> None:
        while self._ws:
            try:
                await asyncio.sleep(KEEPALIVE_INTERVAL_SECONDS)
                ws = self._ws
                if not ws:
                    break
                await ws.ping()
                logger.debug("Sent keepalive ping to Gemini")
            except asyncio.CancelledError:
                logger.debug("Gemini keepalive task cancelled")
                raise
            except ConnectionClosedOK as exc:
                logger.info(
                    "Gemini websocket closed gracefully during keepalive: code=%s reason=%s",
                    exc.code,
                    exc.reason,
                )
                break
            except Exception as exc:  # pragma: no cover - runtime safeguard
                logger.warning("Gemini keepalive ping failed: %s", exc, exc_info=True)
                break

    async def request_practice_sentence(self, *, theme: str | None, scenario: str | None) -> None:
        details: list[str] = []
        if theme:
            details.append(f"theme '{theme}'")
        if scenario:
            details.append(f"scenario '{scenario}'")
        focus_clause = " focusing on " + " and ".join(details) if details else ""
        prompt = (
            "Please provide one short, conversational practice sentence"
            f"{focus_clause}. Respond using the agreed bilingual format (English line, newline, '---', newline, Chinese). "
            "After presenting the sentence, encourage me to repeat it aloud and wait for my audio before giving corrections or scores."
        )
        logger.info("Requesting practice sentence from Gemini%s", f" ({', '.join(details)})" if details else "")
        await self.send_user_text(prompt)

    async def send_audio_chunk(self, *, base64_chunk: str, store_audio: bool = True) -> None:
        if self.paused:
            return
        logger.debug("Forwarding audio chunk to Gemini (len=%d)", len(base64_chunk))
        await self._send(
            {
                "realtime_input": {
                    "media_chunks": [
                        {
                            "data": base64_chunk,
                            "mime_type": "audio/pcm",
                        }
                    ]
                }
            }
        )
        # cache bytes for local scoring
        if store_audio:
            try:
                self._audio_buffer.extend(base64.b64decode(base64_chunk))
            except Exception:  # pragma: no cover - defensive fallback
                pass

    async def end_user_turn(self) -> None:
        logger.debug("Marking end of user turn")
        await self._send({"client_content": {"turn_complete": True}})

    async def send_user_text(self, text: str) -> None:
        logger.debug("Sending user text to Gemini (%d chars)", len(text))
        await self._send(
            {
                "client_content": {
                    "turns": [
                        {
                            "role": "user",
                            "parts": [{"text": text}],
                        }
                    ],
                    "turn_complete": True,
                }
            }
        )

    def reset_audio_buffer(self) -> bytes:
        data = bytes(self._audio_buffer)
        self._audio_buffer.clear()
        if data:
            logger.debug("Cleared audio buffer (%d bytes)", len(data))
        return data

    async def events(self) -> AsyncGenerator[GeminiEvent, None]:
        if not self._ws:
            raise RuntimeError("Gemini session is not initialized")
        current_response: list[str] = []
        try:
            async for raw_response in self._ws:
                logger.debug("Received payload from Gemini (bytes=%d)", len(raw_response))
                response = json.loads(raw_response)
                server_content = response.get("serverContent")
                if server_content:
                    parts = server_content.get("modelTurn", {}).get("parts", [])
                    for part in parts:
                        text = part.get("text")
                        if text:
                            current_response.append(text)
                            yield GeminiEvent(type="text-delta", text=text)

                    if server_content.get("turnComplete"):
                        full_text = "".join(current_response)
                        current_response.clear()
                        lowered = full_text.lower()
                        if "can i have a break" in lowered:
                            self.paused = True
                        elif "ok let's continue" in lowered:
                            self.paused = False
                        yield GeminiEvent(type="turn-complete", text=full_text, paused=self.paused)
        except ConnectionClosedOK as exc:
            logger.info(
                "Gemini stream closed gracefully: code=%s reason=%s",
                exc.code,
                exc.reason,
            )
        except ConnectionClosedError as exc:
            logger.warning(
                "Gemini stream closed unexpectedly: code=%s reason=%s",
                exc.code,
                exc.reason,
            )
            raise
        except Exception as exc:
            logger.exception("Failed to process Gemini event stream: %s", exc)
            raise

    async def close(self) -> None:
        await self._stop_keepalive()
        if self._ws:
            try:
                await self._ws.close()
                logger.info("Gemini websocket closed by client request")
            finally:
                self._ws = None
        if self._ws_cm:
            await self._ws_cm.__aexit__(None, None, None)
            self._ws_cm = None
