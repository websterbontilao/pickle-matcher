import type { Player, SessionState } from "@/lib/schemas";
import { generateId } from "@/lib/utils/id";
import { busyPlayerIds } from "@/lib/engine/generateNextMatch";
import { isNameTaken } from "@/lib/utils/names";

export interface AddPlayersInput {
  names: string[];
}

/** Bulk add — one player per non-empty name, skipping blanks and anything
 * that collides (case-insensitively) with an existing player or an earlier
 * name in the same batch, rather than rejecting the whole submission. */
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
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      consecutiveGames: 0,
      consecutiveSitOuts: 0,
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
