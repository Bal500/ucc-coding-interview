import jwt
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlmodel import Session, select
from .database import get_session
from .models import User
from datetime import datetime, timedelta
from .config import SECRET_KEY, ALGORITHM

# Jelszó hash
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def create_access_token(data: dict):
    """Új JWT token generálása lejárattal"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=60)
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

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
    """Token dekódolása és felhasználó azonosítása"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Érvénytelen token (hiányzó sub)")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="A munkamenet lejárt, jelentkezz be újra!")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Érvénytelen token")
        
    user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Felhasználó nem található")
    return user

def add_owner_to_participants(owner: str, participants_str: Optional[str]) -> str:
    """Tulajdonos hozzáadása a résztvevőkhöz"""
    parts = [p.strip() for p in (participants_str or "").split(",") if p.strip()]
    if owner not in parts:
        parts.insert(0, owner)
    return ", ".join(parts)
