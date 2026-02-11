import os
from google import genai 
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import SQLModel, Field, Session, create_engine, select
from passlib.context import CryptContext
from pydantic import BaseModel
from typing import Optional, List
from dotenv import load_dotenv
import uvicorn, secrets, pyotp, qrcode, io, base64, datetime

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
client = None
has_ai = False

if GOOGLE_API_KEY:
    try:
        client = genai.Client(api_key=GOOGLE_API_KEY)
        has_ai = True
        print("GOOGLE AI KLIENS AKTÍV")
    except Exception as e:
        print(f"Hiba az AI inicializálásakor: {e}")
else:
    print("FIGYELEM: NINCS GOOGLE_API_KEY BEÁLLÍTVA (AI kikapcsolva)")

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

# MODELLEK
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

class ChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(index=True)
    sender: str
    message: str
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    needs_human: bool = False


# DTO
class ChatRequest(BaseModel):
    session_id: str
    message: str

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


# FÜGGVÉNYEK
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

def add_owner_to_participants(owner: str, participants_str: Optional[str]) -> str:
    parts = [p.strip() for p in (participants_str or "").split(",") if p.strip()]
    if owner not in parts:
        parts.insert(0, owner)
    return ", ".join(parts)

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == "admin")).first()
        if not user:
            print("ADMIN GENERÁLÁSA")
            admin_user = User(
                username=os.getenv("ADMIN_USERNAME"),
                hashed_password=get_password_hash(os.getenv("ADMIN_PASSWORD"))
            )
            session.add(admin_user)
            session.commit()
        else:
            print("ADMIN MÁR LÉTEZIK")

@app.get("/")
async def root():
    return {"message": "A szerver működik! Próbáld a /docs oldalt a dokumentációért."}


# AUTH ENDPOINTOK
@app.post("/login")
async def login(data: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == data.username)).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")
    if user.mfa_enabled:
        if not data.mfa_code: raise HTTPException(status_code=403, detail="MFA_REQUIRED")
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(data.mfa_code): raise HTTPException(status_code=401, detail="Hibás 2FA kód!")
    return {"access_token": user.username, "token_type": "bearer", "mfa_enabled": user.mfa_enabled, "role": user.role}

@app.post("/mfa/setup")
async def mfa_setup(req: MFAEnableRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == req.username)).first()
    if not user: raise HTTPException(status_code=404)
    if not user.mfa_secret:
        user.mfa_secret = pyotp.random_base32()
        session.add(user)
        session.commit()
    uri = pyotp.totp.TOTP(user.mfa_secret).provisioning_uri(name=user.username, issuer_name="UCC Event App")
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

@app.post("/users", status_code=201)
async def create_user(user_data: UserCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Nincs jogosultságod!")
    existing_user = session.exec(select(User).where(User.username == user_data.username)).first()
    if existing_user: raise HTTPException(status_code=400, detail="Ez a felhasználónév már foglalt!")
    new_user = User(username=user_data.username, hashed_password=get_password_hash(user_data.password), role="user", mfa_enabled=False)
    session.add(new_user)
    session.commit()
    return {"message": f"Felhasználó ({user_data.username}) létrehozva!"}

@app.post("/request-reset")
async def request_reset(request: ResetRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == request.username)).first()
    if user:
        token = secrets.token_urlsafe(16)
        user.reset_token = token
        session.add(user)
        session.commit()
        print(f"JELSZÓ VISSZAÁLLÍTÓ KÓD ({user.username}): {token}")
    return {"message": "Kód elküldve"}

@app.post("/confirm-reset")
async def confirm_reset(data: ResetConfirm, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.reset_token == data.token)).first()
    if not user: raise HTTPException(status_code=400, detail="Érvénytelen kód!")
    user.hashed_password = get_password_hash(data.new_password)
    user.reset_token = None
    session.add(user)
    session.commit()
    return {"message": "Sikeres jelszócsere!"}


# EVENT ENDPOINTOK
@app.post("/events", response_model=Event)
async def create_event(event: Event, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    event.owner = current_user.username
    event.participants = add_owner_to_participants(event.owner, event.participants)
    session.add(event)
    session.commit()
    session.refresh(event)
    return event

@app.get("/events", response_model=List[Event])
async def read_events(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
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
async def update_event(event_id: int, event_update: Event, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    db_event = session.get(Event, event_id)
    if not db_event: raise HTTPException(status_code=404)
    if db_event.owner != current_user.username: raise HTTPException(status_code=403)
    db_event.title = event_update.title
    db_event.start_date = event_update.start_date
    db_event.end_date = event_update.end_date
    db_event.description = event_update.description
    db_event.participants = add_owner_to_participants(db_event.owner, event_update.participants)
    session.add(db_event)
    session.commit()
    session.refresh(db_event)
    return db_event

@app.delete("/events/{event_id}")
async def delete_event(event_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    event = session.get(Event, event_id)
    if not event: raise HTTPException(status_code=404)
    if event.owner != current_user.username: raise HTTPException(status_code=403)
    session.delete(event)
    session.commit()
    return {"message": "Törölve"}


# CHAT ÉS HELPDESK ENDPOINTOK
@app.post("/chat/send")
async def send_chat_message(
    chat_req: ChatRequest,
    session: Session = Depends(get_session)
):
    last_msg = session.exec(select(ChatMessage).where(ChatMessage.session_id == chat_req.session_id).order_by(ChatMessage.timestamp.desc())).first()
    
    is_human_mode = False
    if last_msg:
        if last_msg.needs_human:
            is_human_mode = True
        if last_msg.sender == "admin":
            is_human_mode = True

    user_msg = ChatMessage(
        session_id=chat_req.session_id,
        sender="user",
        message=chat_req.message,
        needs_human=is_human_mode 
    )
    
    if "ember" in chat_req.message.lower() or "help" in chat_req.message.lower():
        user_msg.needs_human = True
        session.add(user_msg)
        session.commit()
        
        system_msg = ChatMessage(
            session_id=chat_req.session_id,
            sender="bot",
            message="Átkapcsollak egy kollégához. Kérlek várj...",
            needs_human=True
        )
        session.add(system_msg)
        session.commit()
        return {"status": "human_transfer_initiated"}

    session.add(user_msg)
    session.commit()

    if is_human_mode:
        return {"status": "waiting_for_admin"}

    ai_reply_text = ""
    
    if has_ai and client:
        try:
            prompt = f"Válaszolj röviden, kedvesen: {chat_req.message}"
            response = client.models.generate_content(
                model='gemini-2.0-flash', 
                contents=prompt
            )
            ai_reply_text = response.text
        except Exception as e:
            print(f"AI Hiba: {e}")
            ai_reply_text = "Az AI jelenleg pihen. Írj be annyit: 'ember', és jön a segítség!"
    else:
        ai_reply_text = "Szia! Ez egy automata válasz. Ha emberi segítség kell, írd be: 'ember'."

    bot_reply = ChatMessage(
        session_id=chat_req.session_id,
        sender="bot",
        message=ai_reply_text,
        needs_human=False
    )
    session.add(bot_reply)
    session.commit()
    
    return {"status": "bot_replied", "reply": ai_reply_text}

@app.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str, session: Session = Depends(get_session)):
    messages = session.exec(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp)).all()
    return messages

@app.get("/admin/support-requests")
async def get_support_requests(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin": 
        raise HTTPException(status_code=403, detail="Csak adminoknak!")
    
    all_msgs = session.exec(select(ChatMessage).order_by(ChatMessage.timestamp.desc())).all()
    
    session_status = {}
    
    for msg in all_msgs:
        if msg.session_id not in session_status:
            session_status[msg.session_id] = msg.needs_human
            
    result_list = [
        {"session_id": sid, "needs_human": status} 
        for sid, status in session_status.items()
    ]
    
    return result_list

@app.get("/admin/chat/{target_session_id}")
async def get_user_chat_admin(target_session_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403)
    messages = session.exec(select(ChatMessage).where(ChatMessage.session_id == target_session_id).order_by(ChatMessage.timestamp)).all()
    return messages

@app.post("/admin/reply")
async def admin_reply(
    reply_data: dict, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin": raise HTTPException(status_code=403)
    
    admin_msg = ChatMessage(
        session_id=reply_data["target_session_id"],
        sender="admin",
        message=reply_data["message"],
        needs_human=True
    )
    session.add(admin_msg)
    session.commit()
    return {"status": "sent"}

@app.post("/admin/resolve")
async def resolve_chat(
    data: dict,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin": 
        raise HTTPException(status_code=403)
    
    resolve_msg = ChatMessage(
        session_id=data["target_session_id"],
        sender="system",
        message="A beszélgetést az adminisztrátor lezárta. Visszatérés AI módba.",
        needs_human=False 
    )
    session.add(resolve_msg)
    session.commit()
    
    return {"status": "resolved"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
