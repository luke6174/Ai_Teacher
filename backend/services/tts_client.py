from __future__ import annotations

import asyncio
import base64
from typing import Optional

from elevenlabs import ElevenLabs


class TTSClient:
    def __init__(
        self,
        *,
        api_key: Optional[str],
        voice_id: str,
        model_id: str,
    ) -> None:
        self._voice_id = voice_id
        self._model_id = model_id
        self._client: Optional[ElevenLabs] = None
        if api_key:
            self._client = ElevenLabs(api_key=api_key)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def synthesize(self, text: str) -> Optional[str]:
        if not self._client:
            return None

        def _synthesize() -> str:
            audio_stream = self._client.text_to_speech.convert(
                voice_id=self._voice_id,
                text=text,
                model_id=self._model_id,
            )
            if isinstance(audio_stream, (bytes, bytearray)):
                audio_bytes = bytes(audio_stream)
            elif hasattr(audio_stream, "read"):
                audio_bytes = audio_stream.read()
            else:
                audio_bytes = b"".join(chunk for chunk in audio_stream)  # type: ignore[arg-type]
            return base64.b64encode(audio_bytes).decode()

        return await asyncio.to_thread(_synthesize)
