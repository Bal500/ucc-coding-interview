import os
from dotenv import load_dotenv

load_dotenv()

# Környezeti változók
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"

# Adatbázis konfiguráció
DATABASE_FILE = "database.db"
DATABASE_URL = f"sqlite:///{DATABASE_FILE}"

# CORS beállítások
ALLOWED_ORIGINS = ["http://localhost:3000"]
