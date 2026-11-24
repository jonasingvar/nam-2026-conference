<div align="center">

# ORBIT '26

**A conference app built, checked and shipped by agents — all of it on Vercel**

[🎤 The engineering presentation](https://nam-2026-conference.vercel.app/engineering-presentation) · [▶️ The app](https://nam-2026-conference.vercel.app/) · [🏭 The factory](https://nam-2026-factory.vercel.app/)

</div>

Start with the talk: the engineering presentation walks through how this app and
the factory that ships it are built — a conference companion with seats,
waitlists, clashing sessions, check-in, ratings and a clock that runs, turned from
GitHub issues into reviewed, deployed changes by agents on Vercel.

Label an issue `ready-for-ai`, or comment `/ship` on it, and the factory takes it
from there. How it works: [the harness docs](context/engineering-context/harness/index.md).

## 🧑‍💻 Run it locally

```bash
npm install
npm run dev      # seed, then API :3001 + web :5173
npm test         # unit + API, seconds
npm run verify   # Playwright, desktop and mobile
```

Everything the code cannot tell you is in [`context/`](context/index.md).
