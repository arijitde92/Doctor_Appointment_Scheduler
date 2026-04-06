"""
Scheduler Agent — Placeholder

This is a placeholder agent for the appointment scheduling functionality.
It will eventually use the Google Calendar MCP to create calendar events
for doctor appointments.

For now, it acknowledges scheduling requests and informs the user that
the booking will be handled once the Calendar integration is ready.
"""

from google.adk.agents.llm_agent import Agent

# ─────────────────────────────────────────────────────────────────────────────
# Agent definition
# ─────────────────────────────────────────────────────────────────────────────
SCHEDULER_DESCRIPTION = (
    "Specialist agent responsible for booking doctor appointments. "
    "It creates calendar events with appointment details including doctor name, "
    "clinic address, date, time, and any special instructions."
)

SCHEDULER_INSTRUCTION = """\
You are the Appointment Scheduler assistant.

Your role is to book doctor appointments by creating calendar events.

**Current Status**: The Google Calendar integration is being set up.
For now, when the user wants to book an appointment, do the following:

1. Confirm the booking details with the user:
   - Doctor name and specialization
   - Clinic name and address
   - Preferred date and time slot
2. Summarize the appointment details clearly.
3. Inform the user: "I have noted your appointment details. The calendar
   booking feature is being finalized and your appointment will be
   confirmed shortly. Please save these details for your reference."

Once the Calendar MCP is integrated, you will create actual Google Calendar
events with all the relevant appointment information.
"""

root_agent = Agent(
    model="gemini-2.5-flash",
    name="scheduler_agent",
    description=SCHEDULER_DESCRIPTION,
    instruction=SCHEDULER_INSTRUCTION,
    tools=[],
)
