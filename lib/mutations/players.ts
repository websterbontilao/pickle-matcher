import {
  SKILL_RATING_DEFAULT,
  SKILL_RATING_MAX,
  SKILL_RATING_MIN,
  SKILL_RATING_STEP,
  type Player,
  type SessionState,
} from "@/lib/schemas";
import { generateId } from "@/lib/utils/id";
import { busyPlayerIds } from "@/lib/engine/generateNextMatch";
import { ratingLookup } from "@/lib/engine/balance";
import { buildPairHistory } from "@/lib/engine/pairHistory";
import { formBestDoublesSplit } from "@/lib/engine/pairing";
import { getSchedulableUnits } from "@/lib/engine/units";
import { currentMatchForCourt, isMatchSwappable } from "./rounds";
import { isNameTaken } from "@/lib/utils/names";

export interface AddPlayersInput {
  names: string[];
}

/** Bulk add — one player per non-empty name, skipping blanks and anything
 * that collides (case-insensitively) with an existing player or an earlier
 * name in the same batch, rather than rejecting the whole submission.
 * Anyone added after the session has started is a newcomer (priority for
 * their first match only). */
export function addPlayers(state: SessionState, input: AddPlayersInput): SessionState {
  const now = Date.now();
  const newPlayers: Player[] = [];

  input.names.forEach((rawName, index) => {
    const trimmed = rawName.trim();
    if (!trimmed) return;
    const takenSoFar = [...state.players, ...newPlayers].map((p) => ({ id: p.id, name: p.name }));
    if (isNameTaken(trimmed, takenSoFar)) return;
    newPlayers.push({
      id: generateId(),
      name: trimmed,
      active: true,
      joinedAt: now + index,
      queuePosition: now + index,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      consecutiveGames: 0,
      consecutiveSitOuts: 0,
      newcomer: state.sessionStarted,
      gamesCredit: 0,
      skillRating: SKILL_RATING_DEFAULT,
    });
  });

  if (newPlayers.length === 0) return state;
  return { ...state, players: [...state.players, ...newPlayers] };
}

export interface EditPlayerInput {
  id: string;
  name: string;
}

export function editPlayer(state: SessionState, input: EditPlayerInput): SessionState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === input.id ? { ...p, name: input.name.trim() } : p)),
  };
}

export interface RemovePlayerInput {
  id: string;
}

/** Soft-delete only: sets active:false, never removes the record, so
 * history/stats and any already-generated matches are preserved untouched.
 * No-ops while the player is currently seated in an undecided match
 * (pending or in-progress) — they must be swapped out or finish their
 * match first, so a live game never loses a player out from under it. */
export function removePlayer(state: SessionState, input: RemovePlayerInput): SessionState {
  if (busyPlayerIds(state).has(input.id)) return state;
  return {
    ...state,
    players: state.players.map((p) => (p.id === input.id ? { ...p, active: false } : p)),
  };
}

export interface LinkPlayersInput {
  aId: string;
  bId: string;
}

/** Bidirectional link. A player can only be linked to one other player at a
 * time, so linking auto-unlinks each side's previous partner first. */
export function linkPlayers(state: SessionState, input: LinkPlayersInput): SessionState {
  if (input.aId === input.bId) return state;

  const players = state.players.map((p) => {
    // Clear any existing partner's link to a/b being re-linked.
    if (p.linkedPlayerId === input.aId || p.linkedPlayerId === input.bId) {
      return { ...p, linkedPlayerId: undefined };
    }
    return p;
  });

  return {
    ...state,
    players: players.map((p) => {
      if (p.id === input.aId) return { ...p, linkedPlayerId: input.bId };
      if (p.id === input.bId) return { ...p, linkedPlayerId: input.aId };
      return p;
    }),
  };
}

export interface UnlinkPlayersInput {
  id: string;
}

export function unlinkPlayers(state: SessionState, input: UnlinkPlayersInput): SessionState {
  const target = state.players.find((p) => p.id === input.id);
  const partnerId = target?.linkedPlayerId;
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id === input.id || (partnerId && p.id === partnerId)) {
        return { ...p, linkedPlayerId: undefined };
      }
      return p;
    }),
  };
}

export interface SetSkillRatingInput {
  id: string;
  skillRating: number;
}

/**
 * Sets a player's skill rating (snapped to the 2.0–6.0 half-step scale),
 * then rebalances: every seated doubles match they're in that hasn't
 * started yet is re-split into the fairest teams — same four players, so
 * the queue is untouched. Calculated forecast matches rebalance on their
 * own; started matches and planned matches are never changed.
 */
export function setSkillRating(state: SessionState, input: SetSkillRatingInput): SessionState {
  const snapped = Math.round(input.skillRating / SKILL_RATING_STEP) * SKILL_RATING_STEP;
  const skillRating = Math.min(SKILL_RATING_MAX, Math.max(SKILL_RATING_MIN, snapped));
  const target = state.players.find((p) => p.id === input.id);
  if (!target || target.skillRating === skillRating) return state;

  const players = state.players.map((p) => (p.id === input.id ? { ...p, skillRating } : p));
  if (state.settings.format === "singles") return { ...state, players };

  const toRebalance = new Set(
    state.courts
      .map((c) => currentMatchForCourt(state, c.id))
      .filter((m) => m && m.winner === null && isMatchSwappable(m) && [...m.teamA, ...m.teamB].includes(input.id))
      .map((m) => m!.id),
  );
  const ratingOf = ratingLookup(players);
  const matches = state.matches.map((m) => {
    if (!toRebalance.has(m.id)) return m;
    const seatedIds = new Set([...m.teamA, ...m.teamB]);
    const units = getSchedulableUnits(players.filter((p) => seatedIds.has(p.id)));
    const history = buildPairHistory(state.matches.filter((other) => other.id !== m.id));
    return { ...m, ...formBestDoublesSplit(units, history, ratingOf) };
  });

  return { ...state, players, matches };
}
