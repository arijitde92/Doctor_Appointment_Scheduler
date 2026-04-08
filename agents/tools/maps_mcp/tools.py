"""
Google Maps MCP Tool — Grounding Lite

Connects to Google Maps Platform's Grounding Lite MCP endpoint to provide
geospatial capabilities:
    - Search places
    - Compute routes (distance & travel duration between two locations)
    - Lookup weather

Required environment variables:
    MAPS_API_KEY  – Google Maps Platform API key with mapstools.googleapis.com enabled

References:
    https://developers.google.com/maps/ai/grounding-lite
    https://github.com/google/mcp/tree/main/examples/launchmybakery
"""

import os
import dotenv
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

MAPS_MCP_URL = "https://mapstools.googleapis.com/mcp"


def get_maps_mcp_toolset() -> MCPToolset:
    """Create and return an MCPToolset for Google Maps Grounding Lite."""
    dotenv.load_dotenv()
    maps_api_key = os.getenv("MAPS_API_KEY", "no_api_found")

    toolset = MCPToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=MAPS_MCP_URL,
            headers={
                "X-Goog-Api-Key": maps_api_key,
            },
            timeout=30.0,
            sse_read_timeout=300.0,
        )
    )
    print("Google Maps MCP Toolset configured for Streamable HTTP connection.")
    return toolset
