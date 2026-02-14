from sqlmodel import Session, select, SQLModel
from .database import engine
from .models import User
from .dependencies import get_password_hash
from .config import ADMIN_USERNAME, ADMIN_PASSWORD


def create_tables():
    """Adatbázis táblák létrehozása"""
    SQLModel.metadata.create_all(engine)
    print("Adatbázis táblák létrehozva")


def create_admin_user():
    """Admin felhasználó létrehozása, ha még nem létezik"""
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == "admin")).first()
        
        if not user:
            print("Admin felhasználó generálása...")
            admin_user = User(
                username=ADMIN_USERNAME,
                hashed_password=get_password_hash(ADMIN_PASSWORD)
            )
            session.add(admin_user)
            session.commit()
            print(f"Admin létrehozva: {ADMIN_USERNAME}")
        else:
            print("Admin már létezik")
