import asyncio
import json
import logging
import threading
import time
import traceback
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Request, Form, File, UploadFile
from pydantic import BaseModel
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from config import settings
from recommender import DescriptorRequest, stream_recommendations, get_similar_songs, get_djset, get_covers_remixes
from sources import refresh_all_sources, wcs_songs_count

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("wcs")


def _auto_seed():
    try:
        if wcs_songs_count() == 0:
            log.info("wcs_songs table empty — seeding from proswingdjs.com...")
            result = refresh_all_sources()
            log.info("Seeding complete: added=%d total=%d", result["added"], result["total"])
    except Exception:
        log.error("Auto-seed failed:\n%s", traceback.format_exc())


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_auto_seed, daemon=True).start()
    yield


app = FastAPI(title="WCS Dance Music Recommender", lifespan=lifespan)

app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    elapsed = (time.monotonic() - start) * 1000
    log.info("%s %s → %s  (%.0fms)", request.method, request.url.path, response.status_code, elapsed)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    if request.session.get("user"):
        return RedirectResponse("/app", status_code=302)
    return templates.TemplateResponse(request=request, name="login.html", context={"error": None})


@app.post("/", response_class=HTMLResponse)
async def login_submit(request: Request, username: str = Form(...), password: str = Form(...)):
    primary_ok = username == settings.app_username and password == settings.app_password
    test_ok = (
        bool(settings.test_username and settings.test_password)
        and username == settings.test_username
        and password == settings.test_password
    )
    if primary_ok or test_ok:
        request.session["user"] = username
        return RedirectResponse("/app", status_code=302)
    return templates.TemplateResponse(request=request, name="login.html", context={"error": "Invalid username or password."})


@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/", status_code=302)


@app.get("/app", response_class=HTMLResponse)
async def index(request: Request):
    if not request.session.get("user"):
        return RedirectResponse("/", status_code=302)
    return templates.TemplateResponse(request=request, name="index.html")


@app.post("/recommend")
async def recommend(request: Request, req: DescriptorRequest):
    if not request.session.get("user"):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    log.info(
        "Recommend SSE request | tempo=%s predict=%d breaks=%s sharp=%d elastic=%d risk=%d tones=%s",
        req.tempo_feel, req.phrase_predictability, req.break_behavior,
        req.accent_sharpness, req.elasticity_potential, req.risk_level, req.emotional_tone,
    )

    async def event_generator():
        try:
            async for item in stream_recommendations(req):
                if item["type"] == "song":
                    yield f"data: {json.dumps(item['song'])}\n\n"
                elif item["type"] == "done":
                    payload = {"curator_note": item.get("curator_note", "")}
                    yield f"event: done\ndata: {json.dumps(payload)}\n\n"
        except Exception as e:
            log.error("Error in SSE stream:\n%s", traceback.format_exc())
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class SimilarRequest(BaseModel):
    title: str
    artist: str


@app.post("/similar")
async def similar(request: Request, req: SimilarRequest):
    if not request.session.get("user"):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    log.info("Similar request | title=%r artist=%r", req.title, req.artist)
    start = time.monotonic()
    try:
        result = get_similar_songs(req.title, req.artist)
        elapsed = (time.monotonic() - start) * 1000
        log.info("Claude returned %d similar songs in %.0fms", len(result.get("recommendations", [])), elapsed)
        return JSONResponse(content=result)
    except json.JSONDecodeError as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to parse Claude response as JSON: {e}"})
    except Exception as e:
        log.error("Unhandled error in /similar:\n%s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/identify")
async def identify(request: Request, audio: UploadFile = File(...)):
    if not request.session.get("user"):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if not settings.audd_api_key:
        return JSONResponse(status_code=503, content={"error": "Song recognition not configured (missing AUDD_API_KEY)."})
    log.info("Identify request | filename=%r content_type=%r", audio.filename, audio.content_type)
    start = time.monotonic()
    try:
        audio_bytes = await audio.read()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.audd.io/",
                data={"api_token": settings.audd_api_key, "return": "apple_music,spotify"},
                files={"file": (audio.filename or "clip.webm", audio_bytes, audio.content_type or "audio/webm")},
            )
        resp.raise_for_status()
        data = resp.json()
    except httpx.TimeoutException:
        log.warning("AudD API timed out")
        return JSONResponse(status_code=504, content={"error": "Song recognition timed out. Try again."})
    except httpx.HTTPStatusError as e:
        log.error("AudD API HTTP error: %s", e)
        return JSONResponse(status_code=502, content={"error": "Song recognition service error."})
    except Exception:
        log.error("Identify error:\n%s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": "Song recognition failed."})
    elapsed = (time.monotonic() - start) * 1000
    log.info("AudD responded in %.0fms | status=%r", elapsed, data.get("status"))
    if data.get("status") != "success" or not data.get("result"):
        return JSONResponse(status_code=404, content={"error": "Song not recognized. Try holding the mic closer to the speaker."})
    result = data["result"]
    title = result.get("title", "")
    artist = result.get("artist", "")
    if not title or not artist:
        return JSONResponse(status_code=404, content={"error": "Song recognized but metadata incomplete."})
    log.info("Identified: title=%r artist=%r", title, artist)
    return JSONResponse(content={"title": title, "artist": artist})


@app.post("/djset")
async def djset(request: Request, req: DescriptorRequest):
    if not request.session.get("user"):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    log.info(
        "DJ Set request | tempo=%s predict=%d tones=%s genre=%s",
        req.tempo_feel, req.phrase_predictability, req.emotional_tone, req.genre,
    )
    start = time.monotonic()
    try:
        result = get_djset(req)
        elapsed = (time.monotonic() - start) * 1000
        log.info("Claude returned DJ set of %d songs in %.0fms", len(result.get("set", [])), elapsed)
        return JSONResponse(content=result)
    except json.JSONDecodeError as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to parse Claude response: {e}"})
    except Exception as e:
        log.error("Unhandled error in /djset:\n%s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/covers")
async def covers(request: Request, req: DescriptorRequest):
    if not request.session.get("user"):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    log.info("Covers/remixes request | tempo=%s tones=%s genre=%s", req.tempo_feel, req.emotional_tone, req.genre)
    start = time.monotonic()
    try:
        result = get_covers_remixes(req)
        elapsed = (time.monotonic() - start) * 1000
        log.info("Claude returned %d covers/remixes in %.0fms", len(result.get("recommendations", [])), elapsed)
        return JSONResponse(content=result)
    except json.JSONDecodeError as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to parse Claude response: {e}"})
    except Exception as e:
        log.error("Unhandled error in /covers:\n%s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/refresh-sources")
async def refresh_sources_endpoint(request: Request):
    if not request.session.get("user"):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    log.info("Manual source refresh triggered by %s", request.session.get("user"))
    try:
        result = await asyncio.get_event_loop().run_in_executor(None, refresh_all_sources)
        return JSONResponse(content=result)
    except Exception as e:
        log.error("Refresh sources failed:\n%s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/health")
async def health():
    return {"status": "ok", "wcs_songs": wcs_songs_count()}
