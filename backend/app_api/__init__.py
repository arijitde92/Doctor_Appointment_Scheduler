"""CareConnect application API: patient accounts, consultation logs, appointments.

Mounted on the ADK FastAPI app under ``/app-api`` (see ``backend/main.py``).
The backend Cloud Run service is private, so only the frontend BFF can call
these routes; the BFF authenticates the patient with an HttpOnly session cookie
and passes the verified user id in the ``X-User-Id`` header.
"""
