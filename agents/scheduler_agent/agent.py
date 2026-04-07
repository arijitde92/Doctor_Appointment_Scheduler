"""
Scheduler Agent — Google Calendar via Composio MCP

This agent creates Google Calendar events for doctor appointments using
the Composio MCP Tool Router.  It receives appointment details (doctor
name, specialization, clinic name, clinic address, date, and time) from
the root agent and creates a calendar event with all relevant information.

The MCP toolset is defined in tools/calendar_mcp/tools.py and connects
to the Composio-hosted Google Calendar MCP endpoint.

Required environment variables (set in .env):
    COMPOSIO_API_KEY   – Composio platform API key
    COMPOSIO_USER_ID   – User identifier for the Composio session
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from google.adk.agents.llm_agent import Agent
from google.genai import types

from tools.calendar_mcp.tools import get_calendar_mcp_toolset

# ─────────────────────────────────────────────────────────────────────────────
# Composio Google Calendar MCP Toolset
# ─────────────────────────────────────────────────────────────────────────────
calendar_toolset = get_calendar_mcp_toolset()

# ─────────────────────────────────────────────────────────────────────────────
# Agent definition
# ─────────────────────────────────────────────────────────────────────────────
SCHEDULER_DESCRIPTION = (
    "Specialist agent responsible for booking doctor appointments by creating "
    "Google Calendar events. It receives appointment details from the root "
    "agent and creates a calendar event with the doctor name, specialization, "
    "clinic name, clinic address, appointment date, and time."
)

SCHEDULER_INSTRUCTION = """\
You are the Appointment Scheduler assistant.

Your role is to book doctor appointments by creating Google Calendar events
using the Composio Google Calendar tools.

## What You Receive

The root agent will provide you with the following appointment details:
- **Doctor name** — Full name of the doctor
- **Specialization** — Medical specialty (e.g., Cardiology, Orthopedics)
- **Clinic name** — Name of the clinic
- **Clinic address** — Full address of the clinic
- **Date** — Appointment date (e.g., 2026-04-10)
- **Time** — Appointment time (e.g., 10:00 AM)

## How to Create the Calendar Event

1. Use the Composio tools to create a Google Calendar event with:
   - **Title**: "Doctor Appointment: Dr. <doctor_name> (<specialization>)"
   - **Location**: "<clinic_name>, <clinic_address>"
   - **Start time**: The provided date and time
   - **Duration**: 30 minutes (default appointment duration)
   - **Description**: A formatted summary including:
     - Doctor: Dr. <name>
     - Specialization: <specialization>
     - Clinic: <clinic_name>
     - Address: <clinic_address>
     - Booked via Doctor Appointment Scheduler

2. After successfully creating the event, confirm to the user with:
   - A summary of the appointment details
   - Confirmation that the Google Calendar event has been created
   - Mention that they should receive a calendar notification

3. If there is an error creating the event, inform the user clearly
   and suggest they try again or note down the details manually.

## Available Tools

You have access to Composio Google Calendar tools through the MCP connection:
- **COMPOSIO_SEARCH_TOOLS** — Search for available tools/actions
- **COMPOSIO_MULTI_EXECUTE_TOOL** — Execute tool actions (create events, etc.)
- **COMPOSIO_MANAGE_CONNECTIONS** — Manage Google Calendar connection

Use COMPOSIO_SEARCH_TOOLS first to find the right Google Calendar action
for creating an event, then use COMPOSIO_MULTI_EXECUTE_TOOL to execute it.

## Important Notes
- Always create the event with all available details.
- Use the timezone Asia/Kolkata (IST) for all events unless specified otherwise.
- If any required detail is missing, inform the root agent that you need
  complete appointment information before proceeding.
"""

root_agent = Agent(
    model="gemini-2.5-flash",
    name="scheduler_agent",
    description=SCHEDULER_DESCRIPTION,
    instruction=SCHEDULER_INSTRUCTION,
    tools=[calendar_toolset],
    generate_content_config=types.GenerateContentConfig(
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(initial_delay=1, attempts=2)
        )
    )
)
