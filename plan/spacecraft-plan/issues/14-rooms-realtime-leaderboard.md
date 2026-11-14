# 14: Blink Battle: rooms, realtime and leaderboard (Supabase)

**Priority:** STRETCH

**What to build:** A player creates a room, shares a short code, and friends join with a nickname (no account). Everyone sees the same round at the same moment, taps are scored server-side, and live room and global daily leaderboards update in realtime.

**Blocked by:** 13. Start only if 13 is playable on production by Sun 14:00; otherwise skip.

**Status:** ready-for-agent

- [ ] Supabase tables for rooms, players, submissions and leaderboard with RLS; anonymous play
- [ ] Host starts the game; rounds stay in sync across clients (within 1 s)
- [ ] Server-side scoring; truth hidden until the reveal
- [ ] Nickname profanity filter and rate limiting
- [ ] Two-headless-client test passes
