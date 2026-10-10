import "server-only";
import { validateEventRegistry } from "./config";
import {
  readEventRegistry,
  readPublishedEvent,
} from "../content-management/store";
import {
  getEventStage,
  getEventYear,
  filterBoardEvents,
  isDefaultBoardFilter,
} from "./rules";
import type { BoardDto, BoardFilters, BoardCardDto } from "./contracts";
import { EventError } from "../event-participation/errors";

export const getEventConfig = readPublishedEvent;
export async function getBoard(filters: BoardFilters = {}): Promise<BoardDto> {
  const eventRegistry = await readEventRegistry();
  validateEventRegistry(eventRegistry);
  if (
    (filters.q?.length ?? 0) > 200 ||
    (filters.year && filters.year !== "all" && !/^\d{4}$/.test(filters.year)) ||
    (filters.stage &&
      !["all", "ongoing", "upcoming", "ended"].includes(filters.stage))
  )
    throw new EventError("INVALID_INPUT");
  const now = new Date();
  const events: BoardCardDto[] = eventRegistry
    .filter((event) => event.published)
    .map((event) => ({
      id: event.id,
      name: event.name,
      theme: event.theme,
      introduction: event.introduction,
      cover: event.cover,
      organizer: event.organizer,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timeZone: event.timeZone,
      target: event.target,
      recommended:
        event.recommended &&
        event.target !== null &&
        getEventStage(event, now) !== "ended" &&
        isDefaultBoardFilter(filters),
      demo: event.demo,
      tags: event.tags,
      stage: getEventStage(event, now),
      year: getEventYear(event),
    }));
  return {
    events: filterBoardEvents(events, filters),
    serverNow: now.toISOString(),
  };
}
