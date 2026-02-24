# This is the main entry point for the FastAPI application. It defines the app and includes a simple route for testing.
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello World"}