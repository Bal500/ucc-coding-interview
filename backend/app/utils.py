import bleach, logging
from sqlmodel import Session, select, SQLModel
from .database import engine
from .models import User
from .dependencies import get_password_hash
from .config import ADMIN_USERNAME, ADMIN_PASSWORD
from cryptography.fernet import Fernet
from .config import ENCRYPTION_KEY

cipher_suite = Fernet(ENCRYPTION_KEY.encode())

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

if not ENCRYPTION_KEY:
    raise ValueError("Nincs ENCRYPTION_KEY beállítva a környezeti változók között!")

def encrypt_text(text: str) -> str:
    """Szöveg titkosítása"""
    if not text:
        return text
    return cipher_suite.encrypt(text.encode()).decode()

def decrypt_text(text: str) -> str:
    """Titkosított szöveg dekódolása"""
    if not text:
        return text
    try:
        return cipher_suite.decrypt(text.encode()).decode()
    except Exception:
        return text

def sanitize_input(text: str) -> str:
    if text:
        return bleach.clean(text, tags=[], strip=True)
    return text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    filename="security.log"
)
security_logger = logging.getLogger("security")

def log_security_event(message: str):
    security_logger.info(message)
