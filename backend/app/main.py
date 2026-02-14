import uvicorn
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import ALLOWED_ORIGINS
from .utils import create_tables, create_admin_user
from app import auth, events, chat
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from .rate_limiter import limiter


# FastAPI
app = FastAPI(
    title="UCC Eseménykezelő Rendszer",
    description="Professzionális eseménykezelő rendszer",
    version="1.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response
    
app.add_middleware(SecurityHeadersMiddleware)

# Routerek
app.include_router(auth.router)
app.include_router(events.router)
app.include_router(chat.router)


@app.on_event("startup")
def on_startup():
    """Alkalmazás indulásakor futó műveletek"""
    create_tables()
    create_admin_user()


@app.get("/", tags=["Root"])
async def root():
    """Gyökér endpoint - API státusz"""
    return {
        "message": "UCC Event App API működik!",
        "version": "2.0.0",
        "docs": "/docs"
    }


if __name__ == "__main__":
    use_ssl = os.path.exists("key.pem") and os.path.exists("cert.pem")
    
    if use_ssl:
        print("HTTPS mód aktív (TLS Encryption)")
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            ssl_keyfile="key.pem",
            ssl_certfile="cert.pem"
        )
    else:
        print("FIGYELEM: Nincs SSL tanúsítvány, HTTP módban futunk!")
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=8000,
            reload=True
        )
