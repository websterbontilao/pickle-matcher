import type { Match, Player, SessionState } from "@/lib/schemas";

/** A side waiting in the paddle stack: a pair (or, in singles, one player)
 * who come off court together, or a lone player with no partner to wait
 * with. */
interface StackTeam {
  playerIds: string[];
  /** Where the team sits in the stack — the earliest `queuePosition` among
   * them, which `recordResult` bumps to the back when they finish. */
  arrival: number;
  /** How their last match went, when they're still waiting together as the
   * side that played it. Null for lone players and anyone yet to play. */
  result: "won" | "lost" | null;
  /** A linked pair: always teammates, never shuffled apart. */
  linked: boolean;
  newcomer: boolean;
}

export interface StackLineup {
  teamA: string[];
  teamB: string[];
}

export interface StackOrder {
  /** The next match to seat, or null if there aren't enough free players. */
  next: StackLineup | null;
  /** Everyone free, in the order the stack will seat them — what Next Up
   * shows. Each entry is a unit that stays together (a linked pair, or a
   * single player). */
  units: { playerIds: string[]; newcomer: boolean }[];
}

/** Each player's latest decided match. */
function lastMatchByPlayer(matches: Match[]): Map<string, Match> {
  const latest = new Map<string, Match>();
  const decided = matches.filter((m) => m.winner !== null).sort((a, b) => a.roundNumber - b.roundNumber);
  for (const m of decided) for (const id of [...m.teamA, ...m.teamB]) latest.set(id, m);
  return latest;
}

/** Groups free players into stack teams: linked pairs stay together, and
 * teammates who just came off court together wait together with their
 * result. Everyone else waits alone. */
function stackTeams(free: Player[], matches: Match[], teamSize: number): StackTeam[] {
  const byId = new Map(free.map((p) => [p.id, p]));
  const lastMatch = lastMatchByPlayer(matches);
  const consumed = new Set<string>();
  const teams: StackTeam[] = [];

  const resultOf = (ids: string[]): StackTeam["result"] => {
    const m = lastMatch.get(ids[0]);
    if (!m || !ids.every((id) => lastMatch.get(id) === m)) return null;
    const side = m.teamA.includes(ids[0]) ? "A" : "B";
    const team = side === "A" ? m.teamA : m.teamB;
    if (team.length !== ids.length || !ids.every((id) => team.includes(id))) return null;
    return m.winner === side ? "won" : "lost";
  };
  const add = (players: Player[], linked: boolean, result: StackTeam["result"]) => {
    for (const p of players) consumed.add(p.id);
    teams.push({
      playerIds: players.map((p) => p.id),
      arrival: Math.min(...players.map((p) => p.queuePosition)),
      result,
      linked,
      newcomer: players.some((p) => p.newcomer),
    });
  };

  if (teamSize === 2) {
    for (const p of free) {
      const partner = p.linkedPlayerId ? byId.get(p.linkedPlayerId) : undefined;
      if (consumed.has(p.id) || !partner || partner.linkedPlayerId !== p.id || consumed.has(partner.id)) continue;
      add([p, partner], true, resultOf([p.id, partner.id]));
    }
  }
  for (const p of free) {
    if (consumed.has(p.id)) continue;
    const m = lastMatch.get(p.id);
    const side = m ? (m.teamA.includes(p.id) ? m.teamA : m.teamB) : [p.id];
    const mates = side.map((id) => byId.get(id)).filter((x): x is Player => !!x && !consumed.has(x.id));
    const together = mates.length === teamSize && resultOf(mates.map((x) => x.id)) !== null;
    if (together) add(mates, false, resultOf(mates.map((x) => x.id)));
    else add([p], false, null);
  }

  return teams.sort((a, b) => a.arrival - b.arrival || a.playerIds.join().localeCompare(b.playerIds.join()));
}

const slotsOf = (teams: StackTeam[]) => teams.reduce((sum, t) => sum + t.playerIds.length, 0);

/** Takes teams front to back, skipping any that would overflow, until
 * exactly `target` slots are filled — or null if they can't be. */
function takeExact(teams: StackTeam[], target: number): StackTeam[] | null {
  const taken: StackTeam[] = [];
  for (const t of teams) {
    if (slotsOf(taken) + t.playerIds.length <= target) taken.push(t);
    if (slotsOf(taken) === target) return taken;
  }
  return null;
}

/** Stack order: 1st & 2nd vs 3rd & 4th, keeping linked pairs on one side. */
function packed(teams: StackTeam[], teamSize: number): StackLineup {
  const teamA: string[] = [];
  const teamB: string[] = [];
  for (const t of teams) (teamA.length + t.playerIds.length <= teamSize ? teamA : teamB).push(...t.playerIds);
  return { teamA, teamB };
}

/** Winners vs winners (or losers vs losers) from two matches, with
 * teammates shuffled: each partners someone from the other side's match.
 * Linked pairs stay together. */
function crossed(first: StackTeam, second: StackTeam): StackLineup {
  if (first.linked || second.linked || first.playerIds.length < 2) {
    return { teamA: first.playerIds, teamB: second.playerIds };
  }
  return { teamA: [first.playerIds[0], second.playerIds[0]], teamB: [first.playerIds[1], second.playerIds[1]] };
}

/**
 * Paddle stacking, 4 off / 4 on: free players are seated strictly in the
 * order they came off court (or joined). A pair coming off court waits for
 * the next pair with the same result — winners play winners, losers play
 * losers, with teammates shuffled across the two pairs. Players with no
 * result to match on (yet to play, or whose partner left) go on in stack
 * order, 1st & 2nd vs 3rd & 4th. If no full group is ready, whoever has
 * waited longest plays rather than leave a court empty. Optionally,
 * newcomers skip the stack and play the next match. No skill balancing and
 * no fairness rules — the stack decides.
 */
export function stackOrder(state: SessionState, free: Player[]): StackOrder {
  const teamSize = state.settings.format === "singles" ? 1 : 2;
  const target = teamSize * 2;
  const teams = stackTeams(free, state.matches, teamSize);

  const groups: { teams: StackTeam[]; lineup: StackLineup }[] = [];
  const pending: Record<"won" | "lost", StackTeam | null> = { won: null, lost: null };
  let fresh: StackTeam[] = [];
  for (const team of teams) {
    if (team.result && team.playerIds.length === teamSize) {
      const waiting = pending[team.result];
      if (waiting) {
        groups.push({ teams: [waiting, team], lineup: crossed(waiting, team) });
        pending[team.result] = null;
      } else {
        pending[team.result] = team;
      }
      continue;
    }
    fresh.push(team);
    const group = takeExact(fresh, target);
    if (group) {
      groups.push({ teams: group, lineup: packed(group, teamSize) });
      fresh = fresh.filter((t) => !group.includes(t));
    }
  }
  const leftover = [...fresh, pending.won, pending.lost]
    .filter((t): t is StackTeam => t !== null)
    .sort((a, b) => a.arrival - b.arrival);

  let order = [...groups.flatMap((g) => g.teams), ...leftover];
  let next: StackLineup | null = groups[0]?.lineup ?? null;

  const newcomers = state.settings.stackNewcomers === "next" ? order.filter((t) => t.newcomer) : [];
  if (newcomers.length > 0) {
    order = [...newcomers, ...order.filter((t) => !t.newcomer)];
    const group = takeExact(order, target);
    next = group ? packed(group, teamSize) : null;
  } else if (!next) {
    const group = takeExact(leftover, target);
    next = group ? packed(group, teamSize) : null;
  }

  const units = order.flatMap((t) =>
    t.linked ? [{ playerIds: t.playerIds, newcomer: t.newcomer }] : t.playerIds.map((id) => ({ playerIds: [id], newcomer: t.newcomer })),
  );
  // Next Up lists whoever is seated next first.
  const nextIds = next ? new Set([...next.teamA, ...next.teamB]) : new Set<string>();
  return {
    next,
    units: [...units.filter((u) => nextIds.has(u.playerIds[0])), ...units.filter((u) => !nextIds.has(u.playerIds[0]))],
  };
}
