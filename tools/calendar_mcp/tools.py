"""
Google Calendar MCP Tool — Composio Tool Router

Connects to the Composio MCP Tool Router to provide Google Calendar
capabilities via the `googlecalendar` toolkit.  The agent can:
    - Create calendar events (appointments)
    - List events
    - Manage connections

The Composio SDK handles OAuth, token refresh, and scoping automatically.

Required environment variables:
    COMPOSIO_API_KEY   – API key from https://platform.composio.dev/settings
    COMPOSIO_USER_ID   – Stable user identifier for the Composio session

References:
    https://docs.composio.dev/docs/providers/google-adk
    https://composio.dev/toolkits/googlecalendar/framework/google-adk
"""

import os
import warnings

import dotenv
from composio import Composio
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset

# Suppress noisy BaseAuthenticatedTool deprecation warnings from Composio
warnings.filterwarnings("ignore", message=".*BaseAuthenticatedTool.*")


def get_calendar_mcp_toolset() -> McpToolset:
    """Create and return an McpToolset for Google Calendar via Composio."""
    dotenv.load_dotenv()

    composio_api_key = os.getenv("COMPOSIO_API_KEY")
    composio_user_id = os.getenv("COMPOSIO_USER_ID")

    if not composio_api_key:
        raise ValueError(
            "COMPOSIO_API_KEY is not set. "
            "Get your key from https://platform.composio.dev/settings"
        )
    if not composio_user_id:
        raise ValueError(
            "COMPOSIO_USER_ID is not set in the environment. "
            "Add COMPOSIO_USER_ID=<your-user-id> to your .env file."
        )

    # Initialize Composio client and create a session scoped to Google Calendar
    composio_client = Composio(api_key=composio_api_key)
    composio_session = composio_client.create(
        user_id=composio_user_id,
        toolkits=["googlecalendar"],
    )
    composio_mcp_url = composio_session.mcp.url

    # Build the ADK McpToolset with the Composio MCP URL
    toolset = McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=composio_mcp_url,
            headers={"x-api-key": composio_api_key},
        )
    )
    print(f"Composio Google Calendar MCP Toolset configured (user={composio_user_id}).")
    return toolset
