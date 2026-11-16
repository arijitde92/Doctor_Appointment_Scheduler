# Doctor Appointment Scheduler

## Project Overview

Doctor Appointment Scheduler is an AI-powered, multi-agent doctor appointment booking solution built to simplify the complete patient journey in a single conversational experience. Instead of forcing users to search across clinic portals, compare doctors manually, read reviews from separate sources, calculate travel time, check availability, and then book on another platform, this system brings all of those steps together through coordinated AI agents and MCP-based tool integrations. It helps users discover suitable doctors by specialization and city, evaluate options using clinic location and patient feedback, choose convenient time slots, and finally schedule the appointment directly on Google Calendar, making the overall process faster, smarter, and more user-friendly.

## Live Demo

The application is deployed on Google Cloud Run:
[https://doctor-appointment-web-731638668879.asia-south2.run.app](https://doctor-appointment-web-731638668879.asia-south2.run.app)

## Demo Video
Checkout the demo video [here](https://drive.google.com/file/d/1crVf8UKEkUTxU_4_jolV2aocKHAVfUUn/view?usp=drive_link)

## Why This Project Matters

Most doctor discovery and appointment booking experiences are fragmented. Users often need to switch between multiple apps and websites just to answer a few basic questions:

- Which doctor matches my medical need?
- Which clinic is closest to me?
- How long will it take to reach there?
- What do other patients say about the doctor?
- Is the doctor available at my preferred time?
- How do I confirm the appointment quickly?

This project addresses that fragmentation by combining search, reasoning, review retrieval, route estimation, and scheduling into one unified AI-assisted workflow.

### Main Advantages

- End-to-end conversational booking experience instead of isolated search or booking steps
- Multi-agent architecture that separates coordination, doctor matching, review intelligence, and scheduling
- Grounded responses using structured data and retrieval instead of generic chatbot answers
- Better decision-making through doctor reviews, clinic details, and travel-time awareness
- Reduced user effort by directly creating the appointment in Google Calendar

### What Makes It Different

Unlike a typical healthcare chatbot or doctor directory, this solution is action-oriented. It does not stop at recommending doctors. It can pull doctor and clinic data, estimate distance and travel duration, retrieve grounded patient review insights, check available slots, and complete the booking workflow. Its biggest USP is that discovery, decision-making, and appointment scheduling happen in one intelligent flow without forcing the user to switch tools repeatedly.

## Features

- Doctor, clinic, and doctor availability search via Cloud SQL MCP
- Distance and travel time calculation from the user's location to the clinic via Google Maps MCP
- Doctor review discovery through a Vertex AI RAG pipeline
- Appointment scheduling through Google Calendar MCP
- Multi-agent orchestration using a root coordinator, doctor matcher, review agent, and scheduler agent
- Human-in-the-loop conversational refinement for comparing doctors, checking reviews, verifying slots, and confirming bookings
- A patient-facing React UI with a guided intake form, live agent activity, doctor cards, a time-slot grid and booking confirmation

## User Interface

The patient-facing web app in [frontend/](frontend) is built with React, TypeScript, Vite and Tailwind CSS. It uses a healthcare look: clinical teal on a soft neutral canvas, with accessible contrast and a layout that works on phones, tablets and desktops.

- **Guided intake.** Pick a speciality and city, optionally share your location (typed or with "Use my current location"), and choose a preferred day. The app turns this into the first message to the agents.
- **Consultation chat.** Responses stream in as they are generated and render markdown tables. Each reply is labelled with the agent that wrote it (Care Coordinator, Doctor Matcher, Review Analyst, Appointment Scheduler). A collapsible **agent activity timeline** shows each step, such as "Searching Cardiology in Kolkata · Cloud SQL" or "Calculating distance & travel time · Google Maps".
- **Live results panel**, built from the agents' tool results:
  - Doctor cards with experience and clinics, plus distance and travel time when a location was shared
  - A 7-slot availability grid per doctor, clinic and day
  - Appointment cards that move from *requested* to *confirmed*, with an "Open in Google Calendar" link
- **One-click actions.** "Patient reviews", "Check open slots" and tapping an open slot all send ordinary chat messages to the root agent. The agents, tools and prompts are unchanged.
- **Persistent consultations.** Sessions live in Cloud SQL, so reloading the page restores the full conversation and results.

The UI derives everything from the ADK event stream ([frontend/src/lib/adkEvents.ts](frontend/src/lib/adkEvents.ts)), so live streaming and session restore share the same code.

## Technologies Used

This project uses a modular Google Cloud and MCP-first architecture so each part of the workflow is handled by the most appropriate managed service or tool integration.

- Google ADK for multi-agent orchestration and delegation
- Gemini 3.5 Flash for conversational reasoning and task coordination
- Google AI Studio (Gemini API) for the agents' model calls, or Vertex AI with `GOOGLE_GENAI_USE_VERTEXAI=true`
- Vertex AI RAG Engine for grounded retrieval over doctor review data
- `text-embedding-005` for review document embeddings
- Google Cloud SQL for structured doctor, clinic, and availability data
- MCP Toolbox for exposing Cloud SQL queries as MCP tools
- Google Maps Grounding Lite MCP for route, distance, and travel-time estimation
- Google Cloud Storage for storing doctor review documents used by the RAG pipeline
- Composio for Google Calendar MCP connectivity and OAuth-backed action execution
- FastAPI (via ADK's `get_fast_api_app`) for the backend API layer
- React + TypeScript + Vite + Tailwind CSS for the patient-facing UI, served by a small Express backend-for-frontend
- Cloud Run for both services: a public frontend and a private backend, linked by service-to-service ID-token auth
- Cloud SQL (MySQL) for persistent ADK chat sessions, and Secret Manager for API keys and the DB password
- Cloud Trace (via ADK's OpenTelemetry spans) and Cloud Logging for tracing every agent step, LLM call, tool call and token count
- Cloud Monitoring (ADK's GenAI metrics via the Telemetry API) for a dashboard of token usage, LLM latency per response, and agent, tool and turn latency

### Why This Stack

- It cleanly separates reasoning, retrieval, search, and action execution
- It supports modular growth as new agents or tools are added
- It is suitable for real-world deployment because the app logic remains lightweight while managed cloud services handle scale, storage, and integrations
- It supports production-style extensibility for new cities, specialties, data sources, and scheduling integrations

## Process Flow Diagram

![Process Flow Diagram](assets/images/process_flow_diagram.png)

## Architecture Diagram

![Architecture Diagram](assets/images/architecture_diagram.png)

## Deployment

```text
Browser ──▶ doctor-appointment-web  (Cloud Run, public)
              React UI + Express BFF: /api/sessions, /api/chat (SSE)
                │  Google ID token (service account web-sa, roles/run.invoker)
                ▼
            doctor-appointment-api  (Cloud Run, private)
              FastAPI + Google ADK agents (service account agent-sa)
                ├─ Toolbox on Cloud Run ─▶ Cloud SQL (doctors, clinics, availability)
                ├─ Google Maps Grounding Lite MCP
                ├─ Vertex AI RAG Engine (doctor reviews)
                ├─ Composio ─▶ Google Calendar
                ├─ ADK sessions ─▶ Cloud SQL database adk_sessions
                └─ OpenTelemetry ─▶ Cloud Trace (spans) · Cloud Monitoring (metrics)
```

```bash
bash deploy/setup_gcp.sh        # one-time: APIs, sessions DB, secrets, web-sa, trace + metrics access
bash deploy/deploy_backend.sh   # private API service (root Dockerfile)
bash deploy/deploy_frontend.sh  # public web service (frontend/Dockerfile) + invoker binding
bash deploy/setup_monitoring.sh # Cloud Monitoring dashboard + consultations metric
```

See [Project_Steps.md, Phase 8](Project_Steps.md#phase-8----cloud-run-deployment) for details, and Phase 9 for local development.

### Observability

- **Dashboard (Cloud Monitoring):** *Doctor Appointment Scheduler - Agents and LLM*, created by `deploy/setup_monitoring.sh`. It shows consultations, total tokens (by input/output and by agent), average tokens per consultation, LLM latency per response (average, p50/p95, by agent), chat turn latency, tool latency and the share of cached input tokens. It is built from ADK's OpenTelemetry metrics and a log-based count of new consultations.
- **Traces (Cloud Trace):** one trace per chat message in [Trace Explorer](https://console.cloud.google.com/traces/explorer), showing each agent handoff, Gemini call (with token counts) and tool call, with timings. Filter on `gen_ai.conversation.id` to see one conversation. Prompts and responses are left out of traces by default because conversations contain health details.

See [Project_Steps.md, Phase 10](Project_Steps.md#phase-10----observability-cloud-trace-cloud-monitoring-and-logs) for how it's wired, settings, the metrics and PromQL queries behind the dashboard, logs, and per-conversation token usage.

## Installation and Setup

The complete environment setup, Google Cloud configuration, database creation, MCP setup, RAG pipeline preparation, Maps integration, and Google Calendar integration steps are documented in [Project_Steps.md](Project_Steps.md).

### Setup Summary

1. Create and configure a Google Cloud project.
2. Enable the required Google Cloud APIs such as Vertex AI, Cloud SQL, Cloud Run, Cloud Storage, IAM, and Maps services.
3. Create the required service account and assign the necessary IAM roles.
4. Create the Cloud SQL instance and database.
5. Generate and import the synthetic seed SQL data from the `data/seed_sql` flow.
6. Configure the Cloud SQL MCP Toolbox using [`agents/tools/cloudsql_mcp/tools.yaml`](agents/tools/cloudsql_mcp/tools.yaml).
7. Upload doctor review files to Google Cloud Storage and configure the Vertex AI RAG pipeline.
8. Configure Google Maps MCP for route and travel-time support.
9. Configure Composio and connect Google Calendar for appointment scheduling.
10. Install Python dependencies and run the backend locally (`uvicorn backend.main:app --port 8000`).
11. Run the React UI locally (`cd frontend && npm install && npm run dev`).
12. Deploy the backend and frontend to Cloud Run with the scripts in [deploy/](deploy).

### Core Project References

- Setup guide: [Project_Steps.md](Project_Steps.md)
- Review upload guide: [gcs_upload_guide.md](gcs_upload_guide.md)
- Backend API entrypoint: [backend/main.py](backend/main.py)
- React UI: [frontend/src/App.tsx](frontend/src/App.tsx)
- Frontend server (BFF + ID-token proxy): [frontend/server/index.mjs](frontend/server/index.mjs)
- Deployment scripts: [deploy/](deploy)
- Root agent: [agents/root_agent/agent.py](agents/root_agent/agent.py)
- Doctor matcher agent: [agents/doctor_matcher/agent.py](agents/doctor_matcher/agent.py)
- Review agent: [agents/doctor_rag_agent/agent.py](agents/doctor_rag_agent/agent.py)
- Scheduler agent: [agents/scheduler_agent/agent.py](agents/scheduler_agent/agent.py)

## Repository Highlights

- Synthetic dataset with doctors, clinics, mappings, and availability slots
- Review corpus files for RAG-based doctor feedback retrieval
- Multi-agent orchestration using Google ADK
- MCP integrations for Cloud SQL, Google Maps, and Google Calendar
- Deployment-oriented Google Cloud architecture for scaling beyond the prototype stage
