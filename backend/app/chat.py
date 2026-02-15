from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from google.genai import types
from .database import get_session
from .models import ChatMessage, User
from .schemas import ChatRequest
from .dependencies import get_current_user
from .ai_client import client
from .utils import log_security_event

router = APIRouter(tags=["Chat & Helpdesk"])

SYSTEM_INSTRUCTION = """
Te az "EseményKezelő" alkalmazás mesterséges intelligencia asszisztense vagy.
A feladatod, hogy segíts a felhasználóknak az oldal használatában.
Csak az alábbi funkciókról és információkról beszélhetsz, ne találj ki más dolgokat!

AZ ALKALMAZÁS FUNKCIÓI:
1. Események Kezelése:
    - A felhasználók létrehozhatnak, szerkeszthetnek és törölhetnek eseményeket.
    - Minden eseménynek van címe, kezdete, vége, leírása és résztvevői.
    - "Meeting" opció: Ha bepipálják, a rendszer automatikusan generál egy Jitsi videóhívás linket.
    - "Publikus" opció: Ha bepipálják, az esemény megjelenik a "Publikus" fülön mindenki számára.

2. Naptár Nézetek:
    - "Lista Nézet": Események felsorolása egymás alatt.
    - "Naptár Nézet": Havi, heti vagy napi bontású naptár.
    - "Publikus": Itt láthatóak a mások által publikussá tett események.

3. Közösségi Funkciók:
    - "Naptár megtekintése": A bal oldali sávban a felhasználók rákereshetnek más felhasználókra, és megtekinthetik a naptárukat.
    - Adatvédelem: Ha más naptárát nézzük, a privát események csak "Foglalt" címmel, szürke színnel jelennek meg. A publikus események részletei láthatóak (zöld színnel).
    - Csatlakozás/Leadás: A publikus eseményekhez bárki csatlakozhat (+ Felvétel), ekkor bekerül a saját naptárába is. Később le is adhatja (- Leadás).

4. Felhasználók és Biztonság:
    - Regisztráció és Bejelentkezés van.
    - MFA (Kétlépcsős azonosítás): A fejlécben a "Pajzs" ikonnal aktiválható QR kód segítségével.
    - Jogosultságok: Vannak "user" (átlagos) és "admin" (rendszergazda) felhasználók.
    - Admin jogok: Új felhasználó létrehozása, Helpdesk kérések kezelése.
    - A login oldalon van egy elfelejtett jelszó gomb, jelszót is itt lehet változtatni.

5. Helpdesk:
    - A felhasználók kérdezhetnek tőled (AI).
    - Ha nem tudsz válaszolni, írd hogy a felhasználó az "ember" vagy "help" kulcsszavakkal kapcsolhat admint.

FONTOS SZABÁLYOK:
- Válaszolj röviden, lényegretörően és udvariasan magyarul.
- Ne köszönj minden egyes üzenetben, csak ha a beszélgetés elején járunk, vagy ha a felhasználó köszön. Emlékezz a kontextusra!
- Ha olyan funkcióról kérdeznek, ami nincs a fenti listában, mondd azt, hogy "Ez a funkció jelenleg nem elérhető."
"""

@router.post("/chat/send")
async def send_chat_message(
    chat_req: ChatRequest,
    session: Session = Depends(get_session)
):
    """Chat üzenet küldése"""
    # Ellenőrizzük az előző üzenetet
    last_msg = session.exec(
        select(ChatMessage)
        .where(ChatMessage.session_id == chat_req.session_id)
        .order_by(ChatMessage.timestamp.desc())
    ).first()
    
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
        log_security_event(f"HELPDESK ATKAPCSOLÁS KERVE - Session: {chat_req.session_id}")
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
    
    # AI LOGIKA
    try:
        # 1. Előzmények betöltése
        history_msgs = session.exec(
            select(ChatMessage)
            .where(ChatMessage.session_id == chat_req.session_id)
            .where(ChatMessage.id != user_msg.id) 
            .order_by(ChatMessage.timestamp)
        ).all()

        # 2. Előzmények formázása a Gemini számára (LISTA ÉPÍTÉS)
        formatted_history = []
        for msg in history_msgs:
            role = "user" if msg.sender == "user" else "model"
            if msg.message and msg.message.strip():
                formatted_history.append(types.Content(
                    role=role, 
                    parts=[types.Part.from_text(text=msg.message)]
                ))

        # 3. Chat session létrehozása - ITT ADJUK ÁT A HISTORY-T
        chat = client.chats.create(
            model='gemini-2.0-flash',
            config=types.GenerateContentConfig(system_instruction=SYSTEM_INSTRUCTION),
            history=formatted_history
        )

        # 4. Válasz generálása
        response = chat.send_message(chat_req.message)
        ai_reply_text = response.text

    except Exception as e:
        print(f"AI Hiba: {e}")
        ai_reply_text = "Bocsánat, egy kis technikai hiba történt az AI kapcsolatban."

    
    bot_reply = ChatMessage(
        session_id=chat_req.session_id,
        sender="bot",
        message=ai_reply_text,
        needs_human=False
    )
    session.add(bot_reply)
    session.commit()
    
    return {"status": "bot_replied", "reply": ai_reply_text}


@router.get("/chat/history/{session_id}")
async def get_chat_history(
    session_id: str,
    session: Session = Depends(get_session)
):
    messages = session.exec(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.timestamp)
    ).all()
    return messages


@router.get("/admin/support-requests")
async def get_support_requests(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Csak adminoknak!")
    
    all_msgs = session.exec(
        select(ChatMessage).order_by(ChatMessage.timestamp.desc())
    ).all()
    
    session_status = {}
    for msg in all_msgs:
        if msg.session_id not in session_status:
            session_status[msg.session_id] = msg.needs_human
    
    result_list = [
        {"session_id": sid, "needs_human": status}
        for sid, status in session_status.items()
    ]
    
    return result_list


@router.get("/admin/chat/{target_session_id}")
async def get_user_chat_admin(
    target_session_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Csak adminoknak!")
    
    messages = session.exec(
        select(ChatMessage)
        .where(ChatMessage.session_id == target_session_id)
        .order_by(ChatMessage.timestamp)
    ).all()
    return messages


@router.post("/admin/reply")
async def admin_reply(
    reply_data: dict,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Csak adminoknak!")
    
    admin_msg = ChatMessage(
        session_id=reply_data["target_session_id"],
        sender="admin",
        message=reply_data["message"],
        needs_human=True
    )
    session.add(admin_msg)
    session.commit()
    
    return {"status": "sent"}


@router.post("/admin/resolve")
async def resolve_chat(
    data: dict,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Csak adminoknak!")
    
    resolve_msg = ChatMessage(
        session_id=data["target_session_id"],
        sender="system",
        message="A beszélgetést az adminisztrátor lezárta. Visszatérés AI módba.",
        needs_human=False
    )
    session.add(resolve_msg)
    session.commit()
    
    return {"status": "resolved"}
