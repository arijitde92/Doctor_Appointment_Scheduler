"""
Doctor RAG Agent — Vertex AI RAG Engine + Google ADK

The RAG logic (corpus management, model construction, and the
query_doctor_reviews tool) now lives in tools/rag_tool/rag_tool.py.
This file only contains the ADK Agent definition.

Required environment variables (set in .env or export_env_vars.sh):
    GOOGLE_CLOUD_PROJECT     - GCP project ID
    GOOGLE_CLOUD_LOCATION    - Vertex AI region (e.g. us-central1)
    GCS_REVIEWS_BUCKET_URI   - URI of the GCS bucket/folder holding review files
    RAG_CORPUS_DISPLAY_NAME  - Human-readable name for the RAG corpus
    RAG_CORPUS_RESOURCE_NAME - (Optional) Pre-existing corpus resource name.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from google.adk.agents.llm_agent import Agent
from google.genai import types

from tools.rag_tool import query_doctor_reviews

# ─────────────────────────────────────────────────────────────────────────────
# ADK Agent definition — entry point discovered by the ADK runner
# ─────────────────────────────────────────────────────────────────────────────
root_agent = Agent(
    model="gemini-2.5-flash",
    name="doctor_rag_agent",
    description=(
        "An AI agent that answers questions about doctors by retrieving "
        "information from a knowledge base of patient reviews stored in "
        "Google Cloud Storage and indexed via Vertex AI RAG Engine."
    ),
    instruction=(
        "You are a medical information assistant specialised in answering "
        "questions about doctors listed in our system. "
        "Use the `query_doctor_reviews` tool to retrieve relevant information "
        "from patient review documents before forming your answer. "
        "Be concise, accurate, and empathetic in your responses. "
        "If a user asks about a specific doctor, always invoke the tool "
        "with the doctor's name included in the question."
    ),
    tools=[query_doctor_reviews],
    generate_content_config=types.GenerateContentConfig(
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(
                initial_delay=2.0,
                exp_base=2.0,
                max_delay=60.0,
                attempts=5
            )
        )
    )
)
