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
    date: str
    description: Optional[str] = None

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


def get_session():
    with Session(engine) as session:
        yield session

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
        "mfa_enabled": user.mfa_enabled
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

SCOPES = ['https://www.googleapis.com/auth/calendar']
SERVICE_ACCOUNT_FILE = 'credentials.json'
CALENDAR_ID = 'blaisemarkano@gmail.com' 

def add_to_google_calendar(event_data):
    try:
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        service = build('calendar', 'v3', credentials=creds)

        start_time = f"{event_data.date}T09:00:00"
        end_time = f"{event_data.date}T10:00:00"

        event = {
            'summary': event_data.title,
            'description': event_data.description,
            'start': {
                'dateTime': start_time,
                'timeZone': 'Europe/Budapest',
            },
            'end': {
                'dateTime': end_time,
                'timeZone': 'Europe/Budapest',
            },
            'reminders': {
                'useDefault': False,
                'overrides': [
                    {'method': 'email', 'minutes': 24 * 60},
                    {'method': 'popup', 'minutes': 10},
                ],
            },
        }

        event = service.events().insert(calendarId=CALENDAR_ID, body=event).execute()
        print(f"Esemény létrehozva a Google Naptárban: {event.get('htmlLink')}")
        return True

    except Exception as e:
        print(f"Hiba a Google Naptár integrációnál: {e}")
        return False

@app.post("/events", response_model=Event)
async def create_event(event: Event, session: Session = Depends(get_session)):
    session.add(event)
    session.commit()
    session.refresh(event)
    add_to_google_calendar(event)
    return event

@app.get("/events", response_model=List[Event])
async def read_events(session: Session = Depends(get_session)):
    events = session.exec(select(Event)).all()
    return events

@app.delete("/events/{event_id}")
async def delete_event(event_id: int, session: Session = Depends(get_session)):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Esemény nem található")
    session.delete(event)
    session.commit()
    return {"message": "Esemény törölve"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
