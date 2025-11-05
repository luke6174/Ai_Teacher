from __future__ import annotations

import asyncio
import base64
from typing import Optional

from google import genai
from google.genai import types


class TTSClient:
    def __init__(
        self,
        *,
        api_key: Optional[str],
        voice_name: str,
        model_id: str,
    ) -> None:
        self._voice_name = voice_name
        self._model_id = model_id
        self._client: Optional[genai.Client] = None
        if api_key:
            self._client = genai.Client(api_key=api_key)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def synthesize(self, text: str) -> Optional[str]:
        if not self._client:
            return None

        def _synthesize() -> str:
            response = self._client.models.generate_content(
                model=self._model_id,
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=self._voice_name
                            )
                        )
                    ),
                ),
            )
            try:
                candidate = response.candidates[0]
                part = candidate.content.parts[0]
                inline_data = getattr(part, "inline_data", None)
                if not inline_data or not inline_data.data:
                    raise KeyError("missing inline audio data")
                audio_bytes = inline_data.data
                if isinstance(audio_bytes, str):
                    audio_bytes = base64.b64decode(audio_bytes)
                return base64.b64encode(audio_bytes).decode()
            except (IndexError, AttributeError, KeyError) as exc:
                raise RuntimeError("Unexpected response format from TTS API") from exc

        return await asyncio.to_thread(_synthesize)
