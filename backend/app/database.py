from sqlmodel import Session, create_engine
from .config import DATABASE_URL

engine = create_engine(DATABASE_URL)

def get_session():
    """Adatbázis session dependency"""
    with Session(engine) as session:
        yield session
