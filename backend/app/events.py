import bleach, random, string
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from .database import get_session
from .models import Event, User
from .dependencies import get_current_user, add_owner_to_participants
from .utils import encrypt_text, decrypt_text, log_security_event

router = APIRouter(prefix="/events", tags=["Events"])

def sanitize(text: str):
    """Bemeneti adatok tisztítása (XSS védelem)"""
    if text:
        return bleach.clean(text, tags=[], strip=True)
    return text

def generate_meet_link():
    room_id = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    return f"https://meet.jit.si/UCC-Event-{room_id}"

@router.post("", response_model=Event)
async def create_event(
    event: Event,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Új esemény létrehozása titkosított leírással"""
    event.owner = current_user.username
    event.title = sanitize(event.title)
    
    if event.is_meeting:
        event.meeting_link = sanitize(generate_meet_link())
    
    if event.description:
        event.description = encrypt_text(sanitize(event.description))
    
    event.participants = add_owner_to_participants(event.owner, event.participants)
    
    session.add(event)
    session.commit()
    session.refresh(event)
    
    event.description = decrypt_text(event.description)
    return event

@router.get("", response_model=List[Event])
async def read_events(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Események lekérése feloldott leírással"""
    all_events = session.exec(select(Event)).all()
    my_events = []
    
    for event in all_events:
        is_relevant = False
        if event.owner == current_user.username:
            is_relevant = True
        elif event.participants:
            participant_list = [p.strip() for p in event.participants.split(",")]
            if current_user.username in participant_list:
                is_relevant = True
        
        if is_relevant:
            event.description = decrypt_text(event.description)
            my_events.append(event)
    
    return my_events


@router.put("/{event_id}", response_model=Event)
async def update_event(
    event_id: int,
    event_update: Event,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Esemény frissítése"""
    db_event = session.get(Event, event_id)
    
    if not db_event:
        raise HTTPException(status_code=404, detail="Esemény nem található")
    
    if db_event.owner != current_user.username:
        raise HTTPException(status_code=403, detail="Nincs jogosultságod")
    
    log_security_event(f"ESEMENY MODOSITVA - ID: {event_id} - Modosito: {current_user.username}")
    
    db_event.title = sanitize(event_update.title)
    db_event.start_date = event_update.start_date
    db_event.end_date = event_update.end_date
    
    if event_update.is_meeting and not db_event.meeting_link:
        db_event.meeting_link = sanitize(generate_meet_link())
    elif not event_update.is_meeting:
        db_event.meeting_link = None
        
    db_event.is_meeting = event_update.is_meeting

    if event_update.description:
        db_event.description = encrypt_text(sanitize(event_update.description))
    else:
        db_event.description = None

    db_event.participants = add_owner_to_participants(
        db_event.owner,
        event_update.participants
    )
    
    session.add(db_event)
    session.commit()
    session.refresh(db_event)
    
    if db_event.description:
        db_event.description = decrypt_text(db_event.description)
        
    return db_event


@router.delete("/{event_id}")
async def delete_event(
    event_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Esemény törlése"""
    event = session.get(Event, event_id)
    
    if not event:
        raise HTTPException(status_code=404, detail="Esemény nem található")
    
    if event.owner != current_user.username:
        log_security_event(f"JOGOSULTATLAN TORLESI KISERLET - ID: {event_id} - User: {current_user.username}")
        raise HTTPException(status_code=403, detail="Nincs jogosultságod")
    
    log_security_event(f"ESEMENY TOROLVE - ID: {event_id} - Cím: {event.title} - Torolte: {current_user.username}")
    
    session.delete(event)
    session.commit()
    
    return {"message": "Törölve"}
