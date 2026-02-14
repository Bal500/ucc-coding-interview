import bleach
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from .database import get_session
from .models import Event, User
from .dependencies import get_current_user, add_owner_to_participants
from .utils import sanitize_input

router = APIRouter(prefix="/events", tags=["Events"])

def sanitize(text: str):
    """Bemeneti adatok tisztítása (XSS védelem)"""
    if text:
        return bleach.clean(text, tags=[], strip=True)
    return text

@router.post("", response_model=Event)
async def create_event(
    event: Event,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Új esemény létrehozása"""
    event.owner = current_user.username
    
    event.title = sanitize(event.title)
    event.description = sanitize(event.description)
    
    event.participants = add_owner_to_participants(event.owner, event.participants)
    
    session.add(event)
    session.commit()
    session.refresh(event)
    
    return event


@router.get("", response_model=List[Event])
async def read_events(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Összes releváns esemény lekérése"""
    all_events = session.exec(select(Event)).all()
    my_events = []
    
    for event in all_events:
        # tulajdonos
        if event.owner == current_user.username:
            my_events.append(event)
        # résztvevő
        elif event.participants:
            participant_list = [p.strip() for p in event.participants.split(",")]
            if current_user.username in participant_list:
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
    
    # resfresh
    db_event.title = event_update.title
    db_event.start_date = event_update.start_date
    db_event.end_date = event_update.end_date
    db_event.description = event_update.description
    db_event.participants = add_owner_to_participants(
        db_event.owner,
        event_update.participants
    )
    
    session.add(db_event)
    session.commit()
    session.refresh(db_event)
    
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
        raise HTTPException(status_code=403, detail="Nincs jogosultságod")
    
    session.delete(event)
    session.commit()
    
    return {"message": "Törölve"}
