import { agentName } from "../config/catalog";

export interface ActivityLabel {
  label: string;
  source?: string;
  detail?: string;
}

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Human-friendly label for a tool call made by one of the agents. */
export function describeToolCall(name: string, args: Record<string, unknown> = {}): ActivityLabel {
  switch (name) {
    case "transfer_to_agent":
      return { label: `Handing over to ${agentName(s(args.agent_name))}` };
    case "find-doctors":
      return {
        label: `Searching ${s(args.specialization) ?? "doctors"}${s(args.city) ? ` in ${s(args.city)}` : ""}`,
        source: "Cloud SQL",
      };
    case "get-doctor-details":
      return { label: "Fetching doctor profile", source: "Cloud SQL" };
    case "get-doctor-clinics":
      return { label: "Listing the doctor's clinics", source: "Cloud SQL" };
    case "get-doctor-availability":
      return { label: `Checking ${s(args.day_of_week) ?? ""} time slots`.replace("  ", " "), source: "Cloud SQL" };
    case "get-clinic-location":
      return { label: "Looking up clinic address", source: "Cloud SQL" };
    case "compute_routes":
      return { label: "Calculating distance & travel time", source: "Google Maps" };
    case "search_places":
      return { label: "Searching places", source: "Google Maps" };
    case "lookup_weather":
      return { label: "Checking the weather", source: "Google Maps" };
    case "query_doctor_reviews":
      return { label: "Reading patient reviews", source: "Vertex AI RAG" };
    case "COMPOSIO_SEARCH_TOOLS":
      return { label: "Preparing Google Calendar", source: "Google Calendar" };
    case "COMPOSIO_MULTI_EXECUTE_TOOL":
      return { label: "Creating calendar event", source: "Google Calendar" };
    case "COMPOSIO_MANAGE_CONNECTIONS":
      return { label: "Checking calendar connection", source: "Google Calendar" };
    default:
      if (name.startsWith("COMPOSIO_") || name.startsWith("GOOGLECALENDAR_")) {
        return { label: "Working with Google Calendar", source: "Google Calendar" };
      }
      return { label: name.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()) };
  }
}
