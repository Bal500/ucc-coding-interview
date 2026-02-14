import io, base64
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlmodel import Session
from google.genai import types
from gtts import gTTS
from .database import get_session
from .models import ChatMessage
from .ai_client import client, has_ai

router = APIRouter(prefix="/voice", tags=["Voice"])

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

        prompt = "Add vissza szövegként amit ebből a hangfájlból értettél!"
        
        response = client.models.generate_content(
            model='gemini-2.0-flash', 
            contents=[
                types.Part.from_text(text=prompt),
                types.Part.from_bytes(data=file_bytes, mime_type="audio/webm")
            ]
        )
        
        user_text = response.text
        response = client.models.generate_content(
            model='gemini-2.0-flash', 
            contents=[
                types.Part.from_text(text=user_text),
            ]
        )
        ai_response_text = response.text
        
        user_msg = ChatMessage(session_id=session_id, sender="user", message=user_text)
        db.add(user_msg)
        
        ai_msg = ChatMessage(session_id=session_id, sender="bot", message=ai_response_text)
        db.add(ai_msg)
        db.commit()
        
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
