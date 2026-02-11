from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from .database import get_session
from .models import ChatMessage, User
from .schemas import ChatRequest
from .dependencies import get_current_user
from .ai_client import get_ai_response

router = APIRouter(tags=["Chat & Helpdesk"])


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
    
    # Felhasználói üzenet mentése
    user_msg = ChatMessage(
        session_id=chat_req.session_id,
        sender="user",
        message=chat_req.message,
        needs_human=is_human_mode
    )
    
    # Emberi támogatás kérése
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
    
    # Ha emberi módban vagyunk, várjuk az admint
    if is_human_mode:
        return {"status": "waiting_for_admin"}
    
    # AI válasz generálása
    ai_reply_text = get_ai_response(chat_req.message)
    
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
    """Chat előzmények lekérése"""
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
    """Támogatási kérések listája (admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Csak adminoknak!")
    
    all_msgs = session.exec(
        select(ChatMessage).order_by(ChatMessage.timestamp.desc())
    ).all()
    
    # Session státuszok gyűjtése
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
    """Felhasználói chat lekérése (admin)"""
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
    """Admin válasz küldése"""
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
    """Chat lezárása (admin)"""
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
