# 02: Public deployment on a stable URL + FortiGuard submission

**Priority:** MUST

**What to build:** Judges can open the site on a stable public URL with no login, and every merge to main deploys automatically. The production URL is fixed at 09:30 Saturday with a placeholder page so it can be submitted for FortiGuard web-filter classification immediately (classification takes time); this ticket then hardens it once 01 lands.

**Blocked by:** None for the placeholder and FortiGuard submission; 01 for the rest

**Status:** ready-for-agent

- [ ] Production URL serves the tracer bullet with no login (checked in an incognito window)
- [ ] Frontend and Sky Service both deploy from main; preview deploys on branches
- [ ] Vercel deployment protection is off for production
- [ ] URL submitted to FortiGuard (https://www.fortiguard.com/faq/wfratingsubmit); the submission date and current category are recorded in the README
- [ ] Basic uptime check (a cron or manual script) against the API health endpoint
