import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    """Felhasználó modell"""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    role: str = "admin"
    reset_token: Optional[str] = None
    mfa_secret: Optional[str] = None
    mfa_enabled: bool = False


class Event(SQLModel, table=True):
    """Esemény modell"""
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    start_date: str
    end_date: str
    description: Optional[str] = None
    owner: Optional[str] = None
    participants: Optional[str] = None
    is_meeting: bool = False
    meeting_link: Optional[str] = None


class ChatMessage(SQLModel, table=True):
    """Chat üzenet modell"""
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(index=True)
    sender: str
    message: str
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    needs_human: bool = False
