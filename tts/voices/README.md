# Reference voice for cloning

Drop the voice you want LuxTTS to clone here as **`reference.wav`** (a clean
5–15 second mono clip, 16 kHz+; MP3 works too — just point `REFERENCE_VOICE_PATH`
at it).

For best fidelity also set `REFERENCE_TEXT` in `.env` to the exact words spoken
in the clip.

This folder is mounted into the `tts` container at `/app/voices` (see
`docker-compose.yml`). Until a clip is present, `GET /api/tts/health/` reports
`reference_voice_present: false` and synthesis returns HTTP 503 with a clear
message — the rest of the app keeps working.

`reference.wav` is git-ignored so the actual audio isn't committed.
