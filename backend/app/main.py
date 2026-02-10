from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import SQLModel, Field, Session, create_engine, select
from passlib.context import CryptContext
from pydantic import BaseModel
from typing import Optional, List
from google.oauth2 import service_account
from googleapiclient.discovery import build
import uvicorn, secrets, pyotp, qrcode, io, base64, datetime

sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
engine = create_engine(sqlite_url)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    role: str = "admin"
    reset_token: Optional[str] = None
    mfa_secret: Optional[str] = None     
    mfa_enabled: bool = False

class Event(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    start_date: str  
    end_date: str
    description: Optional[str] = None
    owner: Optional[str] = None
    participants: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str
    mfa_code: Optional[str] = None

class ResetRequest(BaseModel):
    username: str

class ResetConfirm(BaseModel):
    token: str
    new_password: str

class MFAEnableRequest(BaseModel):
    username: str

class MFAVerifyRequest(BaseModel):
    username: str
    code: str
    
class UserCreate(BaseModel):
    username: str
    password: str


def get_session():
    with Session(engine) as session:
        yield session

async def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == token)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Érvénytelen hitelesítés",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == "admin")).first()
        if not user:
            print("--- ADMIN GENERÁLÁSA... ---")
            admin_user = User(
                username="admin", 
                hashed_password=get_password_hash("admin123")
            )
            session.add(admin_user)
            session.commit()
            print("--- ADMIN KÉSZ: admin / admin123 ---")
        else:
            print("--- ADMIN MÁR LÉTEZIK ---")

@app.post("/login")
async def login(data: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == data.username)).first()
    
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")

    if user.mfa_enabled:
        if not data.mfa_code:
            raise HTTPException(status_code=403, detail="MFA_REQUIRED")
        
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(data.mfa_code):
            raise HTTPException(status_code=401, detail="Hibás 2FA kód!")

    return {
        "access_token": user.username, 
        "token_type": "bearer", 
        "mfa_enabled": user.mfa_enabled,
        "role": user.role
    }

@app.post("/mfa/setup")
async def mfa_setup(req: MFAEnableRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == req.username)).first()
    if not user: raise HTTPException(status_code=404)

    if not user.mfa_secret:
        user.mfa_secret = pyotp.random_base32()
        session.add(user)
        session.commit()

    uri = pyotp.totp.TOTP(user.mfa_secret).provisioning_uri(
        name=user.username, 
        issuer_name="UCC Event App"
    )

    img = qrcode.make(uri)
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

    return {"qr_code": img_str, "secret": user.mfa_secret}

@app.post("/mfa/verify")
async def mfa_verify(req: MFAVerifyRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == req.username)).first()
    if not user: raise HTTPException(status_code=404)

    totp = pyotp.TOTP(user.mfa_secret)
    if totp.verify(req.code):
        user.mfa_enabled = True
        session.add(user)
        session.commit()
        return {"message": "MFA sikeresen bekapcsolva!"}
    else:
        raise HTTPException(status_code=400, detail="Hibás kód!")

@app.post("/request-reset")
async def request_reset(request: ResetRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == request.username)).first()
    
    if user:
        token = secrets.token_urlsafe(16)
        user.reset_token = token
        session.add(user)
        session.commit()
        print("========================================")
        print(f"JELSZÓ VISSZAÁLLÍTÓ KÓD ({user.username}): {token}")
        print("========================================")

    return {"message": "A visszaállító kódot elküldtük (nézd a szerver logot!)"}

@app.post("/confirm-reset")
async def confirm_reset(data: ResetConfirm, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.reset_token == data.token)).first()

    if not user:
        raise HTTPException(status_code=400, detail="Érvénytelen vagy lejárt kód!")

    user.hashed_password = get_password_hash(data.new_password)
    user.reset_token = None
    session.add(user)
    session.commit()

    return {"message": "Sikeres jelszócsere!"}

def add_owner_to_participants(owner: str, participants_str: Optional[str]) -> str:
    parts = [p.strip() for p in (participants_str or "").split(",") if p.strip()]
    
    if owner not in parts:
        parts.insert(0, owner)
    
    return ", ".join(parts)

@app.post("/events", response_model=Event)
async def create_event(
    event: Event, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    event.owner = current_user.username
    event.participants = add_owner_to_participants(event.owner, event.participants)
    session.add(event)
    session.commit()
    session.refresh(event)
    return event

@app.get("/events", response_model=List[Event])
async def read_events(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    all_events = session.exec(select(Event)).all()
    
    my_events = []
    for event in all_events:
        if event.owner == current_user.username:
            my_events.append(event)
        
        elif event.participants:
            participant_list = [p.strip() for p in event.participants.split(",")]
            
            if current_user.username in participant_list:
                my_events.append(event)
            
    return my_events

@app.put("/events/{event_id}", response_model=Event)
async def update_event(
    event_id: int, 
    event_update: Event, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    db_event = session.get(Event, event_id)
    if not db_event:
        raise HTTPException(status_code=404, detail="Esemény nem található")
    
    if db_event.owner != current_user.username:
        raise HTTPException(status_code=403, detail="Csak a saját eseményedet szerkesztheted!")

    db_event.title = event_update.title
    db_event.start_date = event_update.start_date
    db_event.end_date = event_update.end_date
    db_event.description = event_update.description
    db_event.participants = event_update.participants 

    session.add(db_event)
    session.commit()
    session.refresh(db_event)
    return db_event

@app.delete("/events/{event_id}")
async def delete_event(
    event_id: int, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Esemény nem található")
    
    if event.owner != current_user.username:
        raise HTTPException(status_code=403, detail="Csak a saját eseményedet törölheted!")
    
    session.delete(event)
    session.commit()
    return {"message": "Esemény törölve"}

@app.post("/users", status_code=201)
async def create_user(
    user_data: UserCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
    ):
    
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Nincs jogosultságod ehhez a művelethez!")
    
    existing_user = session.exec(select(User).where(User.username == user_data.username)).first()
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
    return {"message": f"Felhasználó ({user_data.username}) sikeresen létrehozva!"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
