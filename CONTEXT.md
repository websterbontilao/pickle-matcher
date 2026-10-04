# Pickle Matcher — Domain Glossary

**Session** — one courtside meetup. Before it starts it's in *setup*; once started, courts begin auto-filling and format/court config is locked.

**Court** — runs independently with its own current match; there is no global synchronized round.

**Queue** — the waiting order for the next open court spot. Ranked by fewest games played (adjusted for any *catch-up credit*), then by time in line. Finishing a match sends a player to the back of the line.

**Next Up** — the on-screen preview of the queue: who is waiting, in the exact order the scheduler will pick them.

**Newcomer** — a player added *after* the session has started who hasn't played a match yet. Gets top priority for exactly one match, then joins the normal queue. Players added during setup are never newcomers.

**Catch-up credit** — a hidden games count given to a newcomer when their first match is recorded, setting their queue standing level with the lowest-ranked active non-newcomer at that moment, so they don't keep "fewest games" priority until they catch up. Never shown in stats; displayed games played is always the real count.

**First match** — a newcomer's first *recorded* match. Being seated then swapped out before start doesn't use it up; being swapped in by hand counts once recorded. Undoing that result doesn't restore newcomer status.

**Benched (forced play)** — a player who has sat out too many cycles in a row and is guaranteed the next spot. Ranks after newcomers.

**Resting (forced rest)** — a player who has played too many games in a row and drops to the back of the queue unless they're needed to fill a match.
