import secrets, pyotp, qrcode, io, base64, logging
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from .database import get_session
from .models import User
from .schemas import (
    LoginRequest,
    ResetRequest,
    ResetConfirm,
    MFAEnableRequest,
    MFAVerifyRequest,
    UserCreate
)
from .dependencies import get_password_hash, verify_password, get_current_user, create_access_token
from .rate_limiter import limiter

router = APIRouter(prefix="", tags=["Authentication"])

@router.post("/login")
@limiter.limit("5/minute")
async def login(data: LoginRequest, request: Request, session: Session = Depends(get_session)):
    """Bejelentkezés endpoint"""
    user = session.exec(select(User).where(User.username == data.username)).first()
    
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")
    
    # MFA ellenőrzés
    if user.mfa_enabled:
        if not data.mfa_code:
            raise HTTPException(status_code=403, detail="MFA_REQUIRED")
        
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(data.mfa_code):
            raise HTTPException(status_code=401, detail="Hibás 2FA kód!")
    
    access_token = create_access_token(data={"sub": user.username})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "mfa_enabled": user.mfa_enabled,
        "role": user.role
    }

@router.post("/token")
async def login_for_swagger(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session)
):
    """Külön endpoint a Swagger UI Authorize gombjához (Form Data-t vár)"""
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")
    
    access_token = create_access_token(data={"sub": user.username})
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/mfa/setup")
async def mfa_setup(req: MFAEnableRequest, session: Session = Depends(get_session)):
    """MFA beállítása"""
    user = session.exec(select(User).where(User.username == req.username)).first()
    if not user:
        raise HTTPException(status_code=404)
    
    if not user.mfa_secret:
        user.mfa_secret = pyotp.random_base32()
        session.add(user)
        session.commit()
    
    # QR kód generálása
    uri = pyotp.totp.TOTP(user.mfa_secret).provisioning_uri(
        name=user.username,
        issuer_name="UCC Event App"
    )
    img = qrcode.make(uri)
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    
    return {"qr_code": img_str, "secret": user.mfa_secret}


@router.post("/mfa/verify")
async def mfa_verify(req: MFAVerifyRequest, session: Session = Depends(get_session)):
    """MFA kód ellenőrzése"""
    user = session.exec(select(User).where(User.username == req.username)).first()
    if not user:
        raise HTTPException(status_code=404)
    
    totp = pyotp.TOTP(user.mfa_secret)
    if totp.verify(req.code):
        user.mfa_enabled = True
        session.add(user)
        session.commit()
        return {"message": "MFA sikeresen bekapcsolva!"}
    else:
        raise HTTPException(status_code=400, detail="Hibás kód!")


@router.post("/users", status_code=201)
async def create_user(
    user_data: UserCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Új felhasználó létrehozása (csak admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Nincs jogosultságod!")
    
    existing_user = session.exec(
        select(User).where(User.username == user_data.username)
    ).first()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Ez a felhasználónév már foglalt!")
    
    new_user = User(
        username=user_data.username,
        hashed_password=get_password_hash(user_data.password),
        role="user",
        mfa_enabled=False
    )
    session.add(new_user)
    session.commit()
    
    return {"message": f"Felhasználó ({user_data.username}) létrehozva!"}

logging.basicConfig(level=logging.INFO, filename="security.log")
logger = logging.getLogger("security")
@router.post("/request-reset")
async def request_reset(request: ResetRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == request.username)).first()
    if user:
        logger.info(f"Jelszó visszaállítás kérése: {user.username} - IP: {request.client.host}")
    """Jelszó visszaállítás kérése"""
    user = session.exec(select(User).where(User.username == request.username)).first()
    
    if user:
        token = secrets.token_urlsafe(16)
        user.reset_token = token
        session.add(user)
        session.commit()
        print(f"JELSZÓ VISSZAÁLLÍTÓ KÓD ({user.username}): {token}")
    
    return {"message": "Kód elküldve"}


@router.post("/confirm-reset")
async def confirm_reset(data: ResetConfirm, session: Session = Depends(get_session)):
    """Jelszó visszaállítás megerősítése"""
    user = session.exec(select(User).where(User.reset_token == data.token)).first()
    
    if not user:
        raise HTTPException(status_code=400, detail="Érvénytelen kód!")
    
    user.hashed_password = get_password_hash(data.new_password)
    user.reset_token = None
    session.add(user)
    session.commit()
    
    return {"message": "Sikeres jelszócsere!"}
