import json
import logging
import time
import traceback
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from recommender import DescriptorRequest, get_recommendations

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("wcs")

app = FastAPI(title="WCS Dance Music Recommender")

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
    return response


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/recommend")
async def recommend(req: DescriptorRequest):
    log.info(
        "Recommend request | tempo=%s predict=%d breaks=%s sharp=%d elastic=%d risk=%d tones=%s context=%r",
        req.tempo_feel, req.phrase_predictability, req.break_behavior,
        req.accent_sharpness, req.elasticity_potential, req.risk_level,
        req.emotional_tone, req.additional_context[:80] if req.additional_context else "",
    )
    start = time.monotonic()
    try:
        result = get_recommendations(req)
        elapsed = (time.monotonic() - start) * 1000
        log.info("Claude returned %d recommendations in %.0fms", len(result.get("recommendations", [])), elapsed)
        return JSONResponse(content=result)
    except json.JSONDecodeError as e:
        log.error("JSON parse error from Claude response: %s", e)
        return JSONResponse(status_code=500, content={"error": f"Failed to parse Claude response as JSON: {e}"})
    except Exception as e:
        log.error("Unhandled error in /recommend:\n%s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/health")
async def health():
    return {"status": "ok"}
