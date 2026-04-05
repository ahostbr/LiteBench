"""Seed the Multimodal Suite into LiteBench."""
import sqlite3, json, sys

db = sqlite3.connect("C:/Projects/LiteBench/backend/litebench.db")
assets = "C:/Projects/LiteBench/backend/test_assets"

# Create suite
db.execute("INSERT INTO test_suites (name, description, is_default) VALUES (?, ?, 0)",
    ("Multimodal Suite", "Audio transcription, image understanding, and cross-modal reasoning"))
suite_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
print(f"Created suite id={suite_id}")

tests = [
    # === AUDIO: Transcription ===
    {
        "test_id": "mm-audio-transcribe-1",
        "category": "Audio Transcription",
        "name": "Short TTS transcription (weather)",
        "system_prompt": "You are a speech-to-text system. Output ONLY the exact words spoken.",
        "user_prompt": "Transcribe the audio exactly:",
        "eval_keywords": ["weather", "sunny", "warm"],
        "max_tokens": 200,
        "media_type": "audio",
        "media_path": f"{assets}/tts_weather.mp3",
    },
    {
        "test_id": "mm-audio-transcribe-2",
        "category": "Audio Transcription",
        "name": "Pangram transcription (fox)",
        "system_prompt": "You are a speech-to-text system. Output ONLY the exact words spoken.",
        "user_prompt": "Transcribe the audio exactly:",
        "eval_keywords": ["quick brown fox", "lazy dog", "every letter", "alphabet"],
        "max_tokens": 200,
        "media_type": "audio",
        "media_path": f"{assets}/tts_pangram.mp3",
    },
    {
        "test_id": "mm-audio-transcribe-3",
        "category": "Audio Transcription",
        "name": "News clip transcription (Mars)",
        "system_prompt": "You are a speech-to-text system. Output ONLY the exact words spoken.",
        "user_prompt": "Transcribe the audio exactly:",
        "eval_keywords": ["breaking news", "scientists", "water", "Mars"],
        "max_tokens": 200,
        "media_type": "audio",
        "media_path": f"{assets}/tts_news.mp3",
    },
    {
        "test_id": "mm-audio-transcribe-4",
        "category": "Audio Transcription",
        "name": "NYT moon landing narration (long)",
        "system_prompt": "You are a speech-to-text system. Output ONLY the exact words spoken.",
        "user_prompt": "Transcribe the audio exactly:",
        "eval_keywords": ["New York", "moon", "walk"],
        "max_tokens": 500,
        "media_type": "audio",
        "media_path": f"{assets}/nyt_moon_landing.mp3",
    },
    # === AUDIO: Comprehension ===
    {
        "test_id": "mm-audio-comprehend-1",
        "category": "Audio Comprehension",
        "name": "Answer question about audio content",
        "system_prompt": "You are a helpful assistant that can understand audio.",
        "user_prompt": "What topic is being discussed in this audio? Answer in one sentence.",
        "eval_keywords": ["weather", "sunny"],
        "max_tokens": 100,
        "media_type": "audio",
        "media_path": f"{assets}/tts_gemma_weather.mp3",
    },
    {
        "test_id": "mm-audio-comprehend-2",
        "category": "Audio Comprehension",
        "name": "Extract key facts from news audio",
        "system_prompt": "You are a helpful assistant that can understand audio.",
        "user_prompt": "What scientific discovery is announced in this audio? What planet is it about?",
        "eval_keywords": ["water", "Mars"],
        "max_tokens": 200,
        "media_type": "audio",
        "media_path": f"{assets}/tts_news.mp3",
    },
    # === IMAGE: OCR / Text Reading ===
    {
        "test_id": "mm-image-ocr-1",
        "category": "Image Understanding",
        "name": "Read text from newspaper image",
        "system_prompt": "You are a helpful assistant that can analyze images.",
        "user_prompt": "What is the name of the newspaper shown in this image?",
        "eval_keywords": ["New York"],
        "max_tokens": 200,
        "media_type": "image",
        "media_path": f"{assets}/newspaper.jpeg",
    },
    {
        "test_id": "mm-image-ocr-2",
        "category": "Image Understanding",
        "name": "Read headline from newspaper",
        "system_prompt": "You are a helpful assistant that can analyze images.",
        "user_prompt": "What is the main headline of this newspaper? Quote it exactly.",
        "eval_keywords": ["men", "walk", "moon"],
        "max_tokens": 200,
        "media_type": "image",
        "media_path": f"{assets}/newspaper.jpeg",
    },
    # === IMAGE: Visual Reasoning ===
    {
        "test_id": "mm-image-reason-1",
        "category": "Image Understanding",
        "name": "Identify shapes and colors",
        "system_prompt": "You are a helpful assistant that can analyze images.",
        "user_prompt": "Describe the shapes and colors you see in this image.",
        "eval_keywords": ["red", "blue", "rectangle"],
        "max_tokens": 200,
        "media_type": "image",
        "media_path": f"{assets}/shapes_text.png",
    },
    {
        "test_id": "mm-image-describe-1",
        "category": "Image Understanding",
        "name": "Describe newspaper image in detail",
        "system_prompt": "You are a helpful assistant that can analyze images.",
        "user_prompt": "Describe this image in detail. What type of document is it? What era does it appear to be from?",
        "eval_keywords": ["newspaper", "moon", "1969"],
        "max_tokens": 300,
        "media_type": "image",
        "media_path": f"{assets}/newspaper.jpeg",
    },
    # === CROSS-MODAL ===
    {
        "test_id": "mm-cross-1",
        "category": "Cross-Modal",
        "name": "Summarize audio content concisely",
        "system_prompt": "You are a concise summarizer.",
        "user_prompt": "Summarize what you hear in exactly 2 sentences.",
        "eval_keywords": ["New York", "moon"],
        "eval_sentence_count": 2,
        "max_tokens": 150,
        "media_type": "audio",
        "media_path": f"{assets}/nyt_moon_landing.mp3",
    },
    {
        "test_id": "mm-cross-2",
        "category": "Cross-Modal",
        "name": "Extract structured data from audio",
        "system_prompt": "You extract structured information from audio.",
        "user_prompt": 'Listen to this audio and output a JSON object with keys: "topic", "location", "weather_condition". Output ONLY valid JSON.',
        "eval_keywords": ["weather", "sunny"],
        "eval_json": True,
        "max_tokens": 150,
        "media_type": "audio",
        "media_path": f"{assets}/tts_gemma_weather.mp3",
    },
]

for i, t in enumerate(tests):
    db.execute("""INSERT INTO test_cases
        (suite_id, test_id, category, name, system_prompt, user_prompt,
         eval_keywords, eval_anti, eval_json, eval_sentence_count, max_tokens, sort_order,
         media_type, media_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (suite_id, t["test_id"], t["category"], t["name"],
         t["system_prompt"], t["user_prompt"],
         json.dumps(t.get("eval_keywords", [])), json.dumps(t.get("eval_anti", [])),
         int(t.get("eval_json", False)), t.get("eval_sentence_count"),
         t["max_tokens"], i,
         t.get("media_type"), t.get("media_path")))

db.commit()
print(f"Inserted {len(tests)} test cases into suite {suite_id}")
db.close()
