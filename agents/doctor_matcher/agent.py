"""
Doctor Matcher Agent — Cloud SQL MCP Toolbox + Google Maps MCP

This agent uses the MCP Toolbox for Cloud SQL to search for doctors in the
database based on user requirements such as specialization, city, and
day-of-week availability.

When the root agent provides the user's current location, this agent also
uses the Google Maps Grounding Lite MCP to compute distances and travel
durations from the user's location to each matched clinic.

Available Cloud SQL tools (defined in tools/cloudsql_mcp/tools.yaml):
    find-doctors           – Search doctors by specialization AND city
    get-doctor-details     – Look up a single doctor's profile by ID
    get-doctor-clinics     – List all clinics where a doctor practises
    get-doctor-availability – Get time-slot availability for a doctor
                              at a specific clinic on a given day
    get-clinic-location    – Get full address details for a clinic by ID

Available Maps MCP tools (via Google Maps Grounding Lite):
    search_places    – Search for places and get details
    compute_routes   – Compute driving/walking routes between two locations
    lookup_weather   – Lookup weather for a location

Required environment variables:
    TOOLBOX_URL   – URL of the running MCP Toolbox server
                    (default: http://127.0.0.1:5000)
    MAPS_API_KEY  – Google Maps Platform API key
"""

# import sys
# from pathlib import Path
# sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from google.adk.agents.llm_agent import Agent
from google.genai import types
from toolbox_core import ToolboxSyncClient
try:
    from ..tools.maps_mcp.tools import get_maps_mcp_toolset
except ImportError:
    from tools.maps_mcp.tools import get_maps_mcp_toolset
import os

# ─────────────────────────────────────────────────────────────────────────────
# MCP Toolbox connection (Cloud SQL)
# ─────────────────────────────────────────────────────────────────────────────
toolbox_url = os.environ.get("TOOLBOX_URL", "http://127.0.0.1:5000")
toolbox = ToolboxSyncClient(toolbox_url)

# Load all Cloud SQL tools
cloudsql_tools = [
    toolbox.load_tool("find-doctors"),
    toolbox.load_tool("get-doctor-details"),
    toolbox.load_tool("get-doctor-clinics"),
    toolbox.load_tool("get-doctor-availability"),
    toolbox.load_tool("get-clinic-location"),
]

# ─────────────────────────────────────────────────────────────────────────────
# Google Maps MCP Toolset (Grounding Lite)
# ─────────────────────────────────────────────────────────────────────────────
maps_toolset = get_maps_mcp_toolset()

# Combine all tools
tools = cloudsql_tools + [maps_toolset]

# ─────────────────────────────────────────────────────────────────────────────
# Agent definition
# ─────────────────────────────────────────────────────────────────────────────
DOCTOR_MATCHER_DESCRIPTION = (
    "Specialist agent that searches the doctor database to find matching "
    "doctors based on criteria such as medical specialization, city/location, "
    "and availability. It can also retrieve detailed doctor profiles, clinic "
    "information, time-slot availability, and compute distances/travel durations "
    "from the user's current location to clinic locations using Google Maps."
)

DOCTOR_MATCHER_INSTRUCTION = """\
You are a Doctor Matcher assistant. Your job is to help find the right doctors
from our database based on the user's medical needs and location preferences.

## Available Tools

### Database Query Tools (Cloud SQL)

1. **find-doctors**: Search for doctors by specialization AND city.
   - Parameters: `specialization` (string), `city` (string)
   - Returns: List of doctors with their ID, name, gender, age, experience,
     specialization, and the clinic(s) they practise at (clinic ID, name,
     address, city, pin code).
   - Results are sorted by experience (descending) and limited to 20.

2. **get-doctor-details**: Get a single doctor's full profile.
   - Parameters: `doctor_id` (integer)
   - Returns: Doctor's name, gender, age, years of experience, specialization.

3. **get-doctor-clinics**: List all clinics where a doctor practises.
   - Parameters: `doctor_id` (integer)
   - Returns: Clinic ID, name, full address, city, and pin code for each clinic.

4. **get-doctor-availability**: Check availability for a doctor at a specific
   clinic on a given day of the week.
   - Parameters: `doctor_id` (integer), `clinic_id` (integer),
     `day_of_week` (string, e.g. "Monday")
   - Returns: Seven time-slot columns (slot_1 through slot_7). Each slot is
     either a time string (available) or NULL/empty (unavailable).

5. **get-clinic-location**: Get full address details for a specific clinic.
   - Parameters: `clinic_id` (integer)
   - Returns: Clinic ID, name, address, city, pin code, and a concatenated
     full_address string suitable for use in Maps route computation.

### Google Maps Tools (Grounding Lite MCP)

These tools connect to Google Maps Platform via MCP:

- **compute_routes**: Compute driving or walking routes between two locations.
  Use this to find distance and travel duration from the user's location to
  a clinic's full address.
- **search_places**: Search for places by name or type and get details.
- **lookup_weather**: Lookup weather conditions for a location.

## How to Respond

1. When given a specialization and city, use `find-doctors` first.
2. Present results clearly in a structured format including:
   - Doctor name, gender, age, years of experience
   - Clinic name and address
   - Group all clinics for a specific doctor together. For example if Dr. XYZ practices in 3 clinics, then list all 3 clinics under Dr. XYZ.

3. **If the user's current location is provided** (by the root agent):
   - For each matched doctor/clinic, use `get-clinic-location` to get the
     clinic's full address.
   - Then use `compute_routes` from the Google Maps tools to compute the
     driving distance and travel duration from the user's location to each
     clinic's full address.
   - Sort the results in **ascending order of distance** from the user's
     location (closest clinics first).
   - Include the distance and estimated travel duration in the results.
   - Include a Google Maps link if available from the compute_routes response.

4. **If the user's location is NOT provided** or the root agent instructs you
   not to use location features:
   - Skip the distance/travel duration computation.
   - Present results sorted by experience as usual.

5. If asked about a specific doctor's availability, use `get-doctor-availability`.
   Present the available time slots clearly. The database has timings in slot format, where value 1 means booked and value 0 means available.
   where slot_1 means 10:00AM - 11:00AM, slot_2 means 11:00AM - 12:00PM, slot_3 means 12:00PM to 1:00PM, slot_4 means 1:00PM to 2:00PM, slot_5 means 2:00PM to 3:00PM, slot_6 means 3:00PM to 4:00PM, slot_7 means 4:00PM to 5:00PM.
   Present the user the available slots in a readable format.
6. If asked for clinic details, use `get-doctor-clinics`.
7. Always be concise, factual, and helpful.
8. If no results are found, say so clearly and suggest broadening the search
   (e.g. trying a different city or specialization).

## Important Notes
- Specialization values in the database include: Cardiology, Neurology,
  Orthopedics, Dermatology, Pediatrics, Ophthalmology, ENT, General Medicine,
  Gynecology, Psychiatry, etc.
- City values include major Indian cities like Kolkata, Mumbai, Delhi, Bangalore,
  Chennai, Hyderabad, Pune, etc.
- Days of the week are in English: Monday, Tuesday, Wednesday, Thursday, Friday,
  Saturday, Sunday.
- When computing routes, use the clinic's full_address (from get-clinic-location)
  as the destination and the user's provided location as the origin.
"""

root_agent = Agent(
    model="gemini-2.5-flash",
    name="doctor_matcher",
    description=DOCTOR_MATCHER_DESCRIPTION,
    instruction=DOCTOR_MATCHER_INSTRUCTION,
    tools=tools,
    generate_content_config=types.GenerateContentConfig(
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(initial_delay=1, attempts=2)
        )
    )
)
