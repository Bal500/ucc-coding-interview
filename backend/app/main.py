import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import ALLOWED_ORIGINS
from .utils import create_tables, create_admin_user
from app import auth, events, chat

# FastAPI
app = FastAPI(
    title="UCC Event App API",
    description="Professzionális eseménykezelő és chat rendszer",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
