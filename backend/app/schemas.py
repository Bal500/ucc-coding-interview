from typing import Optional
from pydantic import BaseModel


class ChatRequest(BaseModel):
    """Chat kérés DTO"""
    session_id: str
    message: str


class LoginRequest(BaseModel):
    """Bejelentkezési kérés DTO"""
    username: str
    password: str
    mfa_code: Optional[str] = None


class ResetRequest(BaseModel):
    """Jelszó visszaállítási kérés DTO"""
    username: str


class ResetConfirm(BaseModel):
    """Jelszó visszaállítás megerősítés DTO"""
    token: str
    new_password: str


class MFAEnableRequest(BaseModel):
    """MFA bekapcsolási kérés DTO"""
    username: str


class MFAVerifyRequest(BaseModel):
    """MFA ellenőrzési kérés DTO"""
    username: str
    code: str


class UserCreate(BaseModel):
    """Felhasználó létrehozási DTO"""
    username: str
    password: str
    role: str
