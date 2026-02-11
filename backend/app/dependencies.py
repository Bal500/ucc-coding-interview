from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlmodel import Session, select
from .database import get_session
from .models import User

# Jelszó hash
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def get_password_hash(password: str) -> str:
    """Jelszó hashelése"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Jelszó ellenőrzése"""
    return pwd_context.verify(plain_password, hashed_password)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session)
) -> User:
    """Aktuális felhasználó lekérése token alapján"""
    user = session.exec(select(User).where(User.username == token)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Érvénytelen hitelesítés",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def add_owner_to_participants(owner: str, participants_str: Optional[str]) -> str:
    """Tulajdonos hozzáadása a résztvevőkhöz"""
    parts = [p.strip() for p in (participants_str or "").split(",") if p.strip()]
    if owner not in parts:
        parts.insert(0, owner)
    return ", ".join(parts)
