# backend/app/wsgi.py
from app import create_app

# create the Flask application once, export as module-level 'app'
app = create_app()
