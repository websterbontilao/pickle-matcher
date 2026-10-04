# Pickle Matcher — Domain Glossary

**Session** — one courtside meetup. Before it starts it's in *setup*; once started, courts begin auto-filling and format/court config is locked.

**Court** — runs independently with its own current match; there is no global synchronized round.

**Queue** — the waiting order for the next open court spot. Ranked by fewest games played (adjusted for any *catch-up credit*), then by time in line. Finishing a match sends a player to the back of the line.

**Next Up** — the on-screen preview of the queue: who is waiting, in the exact order the scheduler will pick them — players locked into planned matches first, in plan order.

**Forecast** — the projected sequence of the next matches *after* the ones already seated on courts, shown on the Upcoming tab. A best guess, not a commitment: real results, court finishing order, and the reshuffle of players who finish together can all change it. Available before the session starts as a preview of the opening matches.
_Avoid_: Queue (that's the player waiting order), Schedule

**Likely** (forecast match) — made up entirely of players waiting right now who don't first play an earlier forecast match; only a swap, join, or departure changes it.

**Tentative** (forecast match) — depends on who finishes a current match, and when.

**Planned match** — a forecast match the organizer has locked in by swapping players in it. Swapping in match N locks every forecast match up to and including N, so nothing ahead of the edit can rearrange itself around it. When a court opens, planned matches are seated first, in order — ahead of newcomers and fairness rules (the organizer's call wins; rule conflicts are warned about, never blocked). If a planned player becomes unavailable, their spot is refilled from the queue and the rest of the plan stands.
_Avoid_: Reservation, pinned match

**Skill rating** — how strong a player is, from 2.0 to 6.0 in half steps (default 2.0). Used only to split already-chosen players into balanced teams; it never decides *who* plays or when.
_Avoid_: Ranking (that's queue order), Level

**Uneven match** — a match whose teams' average skill ratings (or, in singles, the two players' ratings) differ by 0.5 or more. Flagged to the organizer, never blocked.

**Newcomer** — a player added *after* the session has started who hasn't played a match yet. Gets top priority for exactly one match, then joins the normal queue. Players added during setup are never newcomers.

**Catch-up credit** — a hidden games count given to a newcomer when their first match is recorded, setting their queue standing level with the lowest-ranked active non-newcomer at that moment, so they don't keep "fewest games" priority until they catch up. Never shown in stats; displayed games played is always the real count.

**First match** — a newcomer's first *recorded* match. Being seated then swapped out before start doesn't use it up; being swapped in by hand counts once recorded. Undoing that result doesn't restore newcomer status.

**Benched (forced play)** — a player who has sat out too many cycles in a row and is guaranteed the next spot. Ranks after newcomers.

**Resting (forced rest)** — a player who has played too many games in a row and drops to the back of the queue unless they're needed to fill a match.
