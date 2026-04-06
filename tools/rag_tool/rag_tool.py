"""
RAG Tool — Vertex AI RAG Engine helpers and ADK-compatible tool

This module provides:
    get_or_create_rag_corpus() – Returns (or creates) the Vertex AI RAG corpus
                                  backed by the GCS bucket of doctor reviews.
    build_rag_model()           – Builds a Gemini GenerativeModel with the RAG
                                  retrieval tool attached.
    query_doctor_reviews()      – ADK function tool that accepts a natural-
                                  language question and returns a grounded answer
                                  from the doctor review documents.

Required environment variables (set in .env or export_env_vars.sh):
    GOOGLE_CLOUD_PROJECT     – GCP project ID
    GOOGLE_CLOUD_LOCATION    – Vertex AI region (e.g. us-central1)
    GCS_REVIEWS_BUCKET_URI   – URI of the GCS bucket/folder holding review files
                               e.g. gs://my-bucket/doctor-reviews/
    RAG_CORPUS_DISPLAY_NAME  – Human-readable name for the RAG corpus
                               (default: "doctor_reviews_corpus")
    RAG_CORPUS_RESOURCE_NAME – (Optional) Pre-existing corpus resource name.
                               If set, corpus creation is skipped.
"""

import os
import logging

import vertexai
from vertexai import rag
from vertexai.generative_models import GenerativeModel, Tool

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Configuration from environment
# ─────────────────────────────────────────────────────────────────────────────
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "arijit-de-1992")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
GCS_BUCKET_URI = os.environ.get(
    "GCS_REVIEWS_BUCKET_URI", "gs://your-bucket-name/doctor-reviews/"
)
CORPUS_DISPLAY_NAME = os.environ.get(
    "RAG_CORPUS_DISPLAY_NAME", "doctor_reviews_corpus"
)
# If already set (from a previous run), skip corpus creation.
EXISTING_CORPUS_RESOURCE_NAME = os.environ.get("RAG_CORPUS_RESOURCE_NAME", "")

# ─────────────────────────────────────────────────────────────────────────────
# Embedding model — text-embedding-005 is the recommended model for RAG
# ─────────────────────────────────────────────────────────────────────────────
EMBEDDING_MODEL = "publishers/google/models/text-embedding-005"

# Initialise Vertex AI SDK
vertexai.init(project=PROJECT_ID, location=LOCATION)


# ─────────────────────────────────────────────────────────────────────────────
# Helper: get or create RAG corpus
# ─────────────────────────────────────────────────────────────────────────────
def get_or_create_rag_corpus() -> str:
    """
    Returns the resource name of the RAG corpus.

    - If RAG_CORPUS_RESOURCE_NAME is set, uses that existing corpus.
    - Otherwise creates a new corpus, imports all files from GCS, and
      returns the new corpus resource name.

    Returns:
        str: Full resource name of the RAG corpus, e.g.
             "projects/.../locations/.../ragCorpora/<id>"
    """
    if EXISTING_CORPUS_RESOURCE_NAME:
        logger.info(
            "Using existing RAG corpus: %s", EXISTING_CORPUS_RESOURCE_NAME
        )
        return EXISTING_CORPUS_RESOURCE_NAME

    logger.info(
        "Creating new RAG corpus '%s' in project '%s', location '%s'",
        CORPUS_DISPLAY_NAME,
        PROJECT_ID,
        LOCATION,
    )

    embedding_model_config = rag.RagEmbeddingModelConfig(
        vertex_prediction_endpoint=rag.VertexPredictionEndpoint(
            publisher_model=EMBEDDING_MODEL
        )
    )

    rag_corpus = rag.create_corpus(
        display_name=CORPUS_DISPLAY_NAME,
        backend_config=rag.RagVectorDbConfig(
            rag_embedding_model_config=embedding_model_config
        ),
    )

    logger.info("RAG corpus created: %s", rag_corpus.name)

    logger.info("Importing files from %s …", GCS_BUCKET_URI)
    rag.import_files(
        rag_corpus.name,
        [GCS_BUCKET_URI],
        transformation_config=rag.TransformationConfig(
            chunking_config=rag.ChunkingConfig(
                chunk_size=512,
                chunk_overlap=100,
            )
        ),
        max_embedding_requests_per_min=1000,
    )
    logger.info("File import complete.")

    print(
        "\n[rag_tool] RAG corpus resource name:\n"
        f"  {rag_corpus.name}\n"
        "Add it to your .env as:\n"
        f"  RAG_CORPUS_RESOURCE_NAME={rag_corpus.name}\n"
    )

    return rag_corpus.name


# ─────────────────────────────────────────────────────────────────────────────
# Helper: build the RAG-enabled Gemini model
# ─────────────────────────────────────────────────────────────────────────────
def build_rag_model() -> GenerativeModel:
    """
    Constructs a Gemini GenerativeModel equipped with a Vertex AI RAG
    retrieval tool attached to the doctor-reviews corpus.
    """
    corpus_resource_name = get_or_create_rag_corpus()

    rag_retrieval_config = rag.RagRetrievalConfig(
        top_k=5,
        filter=rag.Filter(vector_distance_threshold=0.5),
    )

    rag_retrieval_tool = Tool.from_retrieval(
        retrieval=rag.Retrieval(
            source=rag.VertexRagStore(
                rag_resources=[
                    rag.RagResource(
                        rag_corpus=corpus_resource_name,
                    )
                ],
                rag_retrieval_config=rag_retrieval_config,
            )
        )
    )

    model = GenerativeModel(
        model_name="gemini-2.0-flash-001",
        tools=[rag_retrieval_tool],
        system_instruction=(
            "You are a helpful medical information assistant. "
            "Use the provided doctor review documents to answer questions "
            "about doctors — their specializations, patient feedback, ratings, "
            "experience, and overall reputation. "
            "Always ground your answers in the retrieved review content. "
            "If you cannot find relevant information, say so clearly."
        ),
    )
    return model


# ─────────────────────────────────────────────────────────────────────────────
# ADK-compatible tool: query_doctor_reviews
# ─────────────────────────────────────────────────────────────────────────────
_rag_model: GenerativeModel | None = None


def query_doctor_reviews(question: str) -> str:
    """
    Queries the doctor review knowledge base and returns a natural-language
    answer grounded in the review documents.

    Args:
        question: A natural-language question about one or more doctors,
                  e.g. "What do patients say about Dr. Priyanka Roy's
                  neurology practice?"

    Returns:
        A string containing the answer drawn from the review files.
    """
    global _rag_model
    if _rag_model is None:
        _rag_model = build_rag_model()

    response = _rag_model.generate_content(question)
    return response.text
