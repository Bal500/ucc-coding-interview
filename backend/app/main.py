from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Üdv az eseménykezelő rendszerben!"}

@app.get("/events/{event_id}")
def get_event(event_id: int):
    return {"event_id": event_id, "title": "Projekt megbeszélés", "date": "2026-02-10"}
