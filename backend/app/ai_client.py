from google import genai
from .config import GOOGLE_API_KEY

# AI kliens inicializálása
client = None
has_ai = False

if GOOGLE_API_KEY:
    try:
        client = genai.Client(api_key=GOOGLE_API_KEY)
        has_ai = True
        print("GOOGLE AI KLIENS AKTÍV")
    except Exception as e:
        print(f"Hiba az AI inicializálásakor: {e}")
else:
    print("FIGYELEM: NINCS GOOGLE_API_KEY BEÁLLÍTVA (AI kikapcsolva)")


def get_ai_response(user_message: str) -> str:
    """AI válasz generálása a felhasználó üzenetére"""
    if has_ai and client:
        try:
            prompt = f"Válaszolj röviden, kedvesen: {user_message}"
            response = client.models.generate_content(
                model='gemini-2.0-flash',
                contents=prompt
            )
            return response.text
        except Exception as e:
            print(f"AI Hiba: {e}")
            return "Az AI jelenleg pihen. Írj be annyit: 'ember', és jön a segítség!"
    else:
        return "Szia! Ez egy automata válasz. Ha emberi segítség kell, írd be: 'ember'."
