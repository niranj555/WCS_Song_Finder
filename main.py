import json
import logging
import time
import traceback
from fastapi import FastAPI, Request, Form
from pydantic import BaseModel
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from config import settings
from recommender import DescriptorRequest, stream_recommendations, get_similar_songs, get_djset, get_covers_remixes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("wcs")

app = FastAPI(title="WCS Dance Music Recommender")

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
    if username == settings.app_username and password == settings.app_password:
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


@app.get("/health")
async def health():
    return {"status": "ok"}
