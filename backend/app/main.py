from contextlib import asynccontextmanager

import structlog
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import engine, get_db
from app.logging_config import configure_logging

configure_logging()
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("startup")
    yield
    await engine.dispose()
    log.info("shutdown")


app = FastAPI(title="Wishlist API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_credentials=True,  # refresh token is an httpOnly cookie
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    # Must touch the DB: the uptime pinger relies on this to keep Supabase from pausing.
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        log.exception("health_db_unreachable")
        raise HTTPException(status_code=503, detail="Database unreachable")
    return {"status": "ok"}
