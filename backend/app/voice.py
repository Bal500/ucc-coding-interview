import io, base64
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlmodel import Session, select
from google.genai import types
from gtts import gTTS
from .database import get_session
from .models import ChatMessage
from .ai_client import client, has_ai

router = APIRouter(prefix="/voice", tags=["Voice"])

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
    - Ha nem tudsz válaszolni, vagy a felhasználó kéri, az üzenet továbbítható egy hús-vér adminnak.

FONTOS SZABÁLYOK:
- Válaszolj röviden, lényegretörően és udvariasan magyarul.
- Ne köszönj minden egyes üzenetben, csak ha a beszélgetés elején járunk, vagy ha a felhasználó köszön. Emlékezz a kontextusra!
- Ha olyan funkcióról kérdeznek, ami nincs a fenti listában, mondd azt, hogy "Ez a funkció jelenleg nem elérhető."
"""

@router.post("/process")
async def process_voice(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    db: Session = Depends(get_session)
):
    if not has_ai:
        return JSONResponse({
            "user_text": "(Nincs AI kapcsolat)",
            "ai_text": "Sajnos az AI nincs beállítva.",
        })

    try:
        file_bytes = await file.read()
        
        if len(file_bytes) == 0:
            raise HTTPException(status_code=400, detail="Üres hangfájl érkezett")

        # 1. Hang leirata
        prompt_transcribe = "Add vissza szövegként pontosan, amit ebből a hangfájlból értettél (csak a leiratot)!"
        
        response = client.models.generate_content(
            model='gemini-2.0-flash', 
            contents=[
                types.Part.from_text(text=prompt_transcribe),
                types.Part.from_bytes(data=file_bytes, mime_type="audio/webm")
            ]
        )
        
        user_text = response.text
        
        # 2. Előzmények betöltése
        history_msgs = db.exec(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.timestamp)
        ).all()

        # 3. Előzmények formázása
        formatted_history = []
        for msg in history_msgs:
            role = "user" if msg.sender == "user" else "model"
            if msg.message and msg.message.strip():
                formatted_history.append(types.Content(
                    role=role, 
                    parts=[types.Part.from_text(text=msg.message)]
                ))

        # 4. Chat Session létrehozása a SYSTEM PROMPT-tal és HISTORY-val
        chat = client.chats.create(
            model='gemini-2.0-flash', 
            config=types.GenerateContentConfig(system_instruction=SYSTEM_INSTRUCTION),
            history=formatted_history
        )
        
        # 5. Válasz generálása
        response = chat.send_message(user_text)
        ai_response_text = response.text
        
        # Mentés adatbázisba
        user_msg = ChatMessage(session_id=session_id, sender="user", message=user_text)
        db.add(user_msg)
        
        ai_msg = ChatMessage(session_id=session_id, sender="bot", message=ai_response_text)
        db.add(ai_msg)
        db.commit()
        
        # 6. TTS
        mp3_fp = io.BytesIO()
        tts = gTTS(text=ai_response_text, lang='hu')
        tts.write_to_fp(mp3_fp)
        
        mp3_bytes = mp3_fp.getvalue()
        audio_base64 = base64.b64encode(mp3_bytes).decode('utf-8')

        return JSONResponse({
            "user_text": user_text,
            "ai_text": ai_response_text,
            "audio_base64": audio_base64
        })

    except Exception as e:
        print(f"Voice error: {e}")
        raise HTTPException(status_code=500, detail=f"Hiba történt: {str(e)}")
    