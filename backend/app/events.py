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

@router.get("/user/{target_username}", response_model=List[Event])
async def read_user_events(
    target_username: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Egy adott felhasználó naptárának lekérése"""
    
    events = session.exec(select(Event).where(Event.owner == target_username)).all()
    safe_events = []
    
    for event in events:
        is_participant = False
        if event.participants:
            participant_list = [p.strip() for p in event.participants.split(",")]
            if current_user.username in participant_list:
                is_participant = True

        if event.is_public or event.owner == current_user.username or is_participant:
            if event.description:
                event.description = decrypt_text(event.description)
            safe_events.append(event)
        
        else:
            safe_event = Event.model_validate(event)
            safe_event.title = "Foglalt"
            safe_event.description = None
            safe_event.meeting_link = None
            safe_event.participants = None
            safe_events.append(safe_event)
            
    return safe_events

@router.get("", response_model=List[Event])
async def read_events(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Események lekérése - CSAK AZOK, AHOL RÉSZTVEVŐ VAGYOK"""
    all_events = session.exec(select(Event)).all()
    my_events = []
    
    for event in all_events:
        is_participant = False
        
        if event.participants:
            participant_list = [p.strip() for p in event.participants.split(",")]
            if current_user.username in participant_list:
                is_participant = True
        
        if is_participant:
            if event.description:
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
    db_event.is_public = event_update.is_public
    
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

@router.post("/check-conflict")
async def check_conflict(
    event: Event,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Ellenőrzi, hogy az új időpont ütközik-e meglévő eseménnyel"""
    statement = select(Event).where(
        Event.owner == current_user.username,
        Event.start_date < event.end_date,
        Event.end_date > event.start_date
    )
    
    if event.id:
        statement = statement.where(Event.id != event.id)
        
    conflicts = session.exec(statement).all()
    
    if conflicts:
        return {
            "conflict": True,
            "title": conflicts[0].title,
            "start_date": conflicts[0].start_date
        }
    
    return {"conflict": False}

@router.get("/public", response_model=List[Event])
async def get_public_events(session: Session = Depends(get_session)):
    """Minden publikus esemény lekérése"""
    events = session.exec(select(Event).where(Event.is_public == True)).all()
    
    for event in events:
        if event.description:
            event.description = decrypt_text(event.description)
            
    return events

@router.post("/{event_id}/join")
async def join_event(
    event_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Jelentkezés egy publikus eseményre"""
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Esemény nem található")

    participants = []
    if event.participants:
        participants = [p.strip() for p in event.participants.split(",")]
    
    if current_user.username not in participants:
        participants.append(current_user.username)
        event.participants = ", ".join(participants)
        session.add(event)
        session.commit()
        return {"message": "Sikeresen hozzáadva a naptáradhoz!"}
    
    return {"message": "Már hozzáadtad ezt az eseményt."}

@router.post("/{event_id}/leave")
async def leave_event(
    event_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Leiratkozás egy publikus eseményről"""
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Esemény nem található")
    
    if event.participants:
        participant_list = [p.strip() for p in event.participants.split(",")]
        
        if current_user.username in participant_list:
            participant_list.remove(current_user.username)
            event.participants = ", ".join(participant_list)
            
            session.add(event)
            session.commit()
            return {"message": "Sikeresen leiratkoztál az eseményről."}
    
    return {"message": "Nem vagy rajta a résztvevők listáján."}
