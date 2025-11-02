from __future__ import annotations

import numpy as np


def calculate_pronunciation_score(audio_data: bytes) -> int:
    """Approximate pronunciation score using simple signal features."""
    if not audio_data:
        return 60
    try:
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        if audio_array.size == 0:
            return 60
        energy = float(np.mean(np.abs(audio_array)))
        zero_crossings = float(np.sum(np.abs(np.diff(np.signbit(audio_array)))))
        energy_score = min(100.0, energy / 1000.0)
        rhythm_score = min(100.0, zero_crossings / 100.0)
        final_score = int(0.6 * energy_score + 0.4 * rhythm_score)
        return max(0, min(100, final_score))
    except Exception:  # pragma: no cover - defensive fallback
        return 70
