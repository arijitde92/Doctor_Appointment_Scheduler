from google.adk.agents.llm_agent import Agent
from toolbox_core import ToolboxSyncClient
import os

toolbox_url = os.environ.get("TOOLBOX_URL", "http://127.0.0.1:5000")
toolbox = ToolboxSyncClient(toolbox_url)

tools = [
    toolbox.load_tool('find-doctors'),
    toolbox.load_tool('get-doctor-details'),
    toolbox.load_tool('get-doctor-clinics'),
    toolbox.load_tool('get-doctor-availability')
]

root_agent = Agent(
    model='gemini-2.5-flash',
    name='root_agent',
    description='A helpful assistant for user questions.',
    instruction='Answer user questions to the best of your knowledge',
    tools=tools,
)
