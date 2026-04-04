# Main FastAPI application entry point
from fastapi import FastAPI

app = FastAPI(title="Doctor Appointment Scheduler API")

@app.get("/")
def read_root():
    return {"message": "Welcome to the Doctor Appointment Scheduler API"}
