import os
from pathlib import Path

from anthropic import Anthropic, APIError
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
MAX_INPUT = 8000
SYSTEM_PROMPT = (BASE / "prompt.txt").read_text(encoding="utf-8")

STANCE = {
    "auto": "",
    "agree": "Stance: lean towards agreeing with the main claim, with a small realistic caveat.",
    "disagree": "Stance: lean towards disagreeing with the main claim, politely and with a practical reason.",
    "mixed": "Stance: balanced, agree on one point and push back on another.",
}
LENGTH = {
    "short": "Length: about 25-40 words.",
    "default": "",
    "long": "Length: about 80-110 words.",
}
ANGLE = {
    "auto": "",
    "practical": "Opening angle: a practical observation.",
    "caveat": "Opening angle: a mild caveat.",
    "reaction": "Opening angle: a direct reaction to the main claim.",
    "daily": "Opening angle: a relatable everyday implication.",
}

app = Flask(__name__, static_folder=None)
client = Anthropic()  # reads ANTHROPIC_API_KEY from .env


@app.after_request
def harden(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data: blob:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; "
        "connect-src 'self' https://api.anthropic.com; "
        "worker-src 'self'"
    )
    return resp


@app.get("/")
def index():
    return send_from_directory(BASE / "static", "index.html")


@app.get("/manifest.json")
def root_manifest():
    return send_from_directory(BASE / "static", "manifest.json", mimetype="application/manifest+json")


@app.get("/service-worker.js")
def root_sw():
    resp = send_from_directory(BASE / "static", "service-worker.js", mimetype="application/javascript")
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp


@app.get("/static/<path:name>")
def assets(name):
    return send_from_directory(BASE / "static", name)


@app.post("/api/draft")
def draft():
    # Reject cross-site requests so other pages can't spend the API key.
    origin = request.headers.get("Origin")
    if origin and origin.split("://", 1)[-1] != request.host:
        return jsonify(error="طلب مرفوض"), 403

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify(error="الصق المقال أو السؤال أولاً"), 400
    if len(text) > MAX_INPUT:
        return jsonify(error=f"النص أطول من {MAX_INPUT} حرف"), 400

    directives = [
        STANCE.get(data.get("stance", "auto"), ""),
        LENGTH.get(data.get("length", "default"), ""),
        ANGLE.get(data.get("angle", "auto"), ""),
    ]
    if data.get("language"):
        directives.append(f"Output language: {str(data['language'])[:30]}.")
    extra = "\n".join(d for d in directives if d)

    user_msg = f"<article>\n{text}\n</article>"
    if extra:
        user_msg += f"\n\n{extra}"

    try:
        r = client.messages.create(
            model=MODEL,
            max_tokens=400,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
    except APIError as e:
        return jsonify(error=f"خطأ من الـ API: {getattr(e, 'message', str(e))}"), 502

    out = "".join(b.text for b in r.content if b.type == "text").strip()
    return jsonify(draft=out)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5057, debug=False)
