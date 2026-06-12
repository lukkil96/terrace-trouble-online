# THE COCKEREL UPDATE: the target is now the club mascot (giant foam Dorking Cockerel) who's nicked the match ball. Same rules, same bounty. The stag has retired to the calm-down pen of history.
# THE STAG HUNT — Meadowbank (mobile + single player + online)

One link, two modes. Open the page, type your name and catchphrase, then pick
**Single player** (everything runs in your browser) or **Online** (up to 12 in
the same ground, server-driven stag, first to land the 25th hit wins the round
for everyone).

## Run locally
    npm install
    node server.js
    # open http://localhost:3000  (same wifi: http://YOUR-LAN-IP:3000)

## Deploy on Render (free)
1. Push this folder to a GitHub repo.
2. render.com → New → Web Service → connect the repo.
3. Build command: `npm install` · Start command: `node server.js` → Create (Free instance).
4. Share the URL. That's the game.
   Note: free instances sleep after ~15 min idle; first visitor waits ~30s while it wakes.

## Mobile
Touch devices get a left-thumb joystick (push far = sprint) and a PUNCH button
(tap = jab, hold = haymaker). Mobile also runs reduced pixel ratio, smaller
shadows and 65m crowd culling for frame rate.

## Music
On kickoff the game plays Guasa Guasa. Two ways it finds it:
1. Drop your own legally-obtained `guasa.mp3` into `public/` (best — works offline, loops cleanly).
2. Otherwise it streams the official YouTube embed invisibly (needs internet; some
   networks/devices block embedded autoplay — the synthesized terrace carries on if so).

## Real commentator voice (recommended!)
The built-in voice is your device's text-to-speech — it will always sound robotic.
For a REAL football commentator, record (or AI-generate, e.g. ElevenLabs) these six clips
as mp3s and drop them in `public/`. The game auto-detects them; TTS is only the fallback.

| File | Suggested line |
|---|---|
| comm_intro.mp3 | "IT'S ALL OVER! Dorking Wanderers ONE, the visitors NIL! And Meadowbank is BOUNCING!" |
| comm_kickoff.mp3 | "OH and it's all kicked off! Five hundred a side on the halfway line! You simply LOVE to see it!" |
| comm_stag.mp3 | "WAIT a minute... there is a STAG in the ground! Pink shirt! Ponytail! SOMEBODY get hold of him!" |
| comm_win.mp3 | "DOWN GOES THE STAG! Absolutely flattened! Scenes! SCENES at Meadowbank!" |
| comm_gaffer.mp3 | "Hold everything — the gaffer is ON the touchline! And he is NOT pleased!" |
| comm_decked.mp3 | "Oh that is OUTRAGEOUS! The GAFFER has been DECKED at Meadowbank!" |

Ham it up. Crowd roars now swell underneath every call automatically.

## Rounds & economy
Rounds do NOT auto-restart: full-time shows the winner plus a scoreboard (stag damage,
fans decked, player KOs, coins). Any player can press "Start next round".
Payouts: 1 coin per fan decked, 5 per player KO, **1000 for landing the final blow on the stag**.
Shop: Programme 25 · Inflatable Hammer 60 · Frozen Saveloy 150. Wallet persists per device.

## Tuning (env vars)
STAG_DELAY_MS (default 60000) · STAG_HITS (25) · ROUND_MS (300000) · PORT (3000)

## Architecture notes
- The block between `/* ==CROWD SIM== */` markers is byte-identical in
  server.js and public/index.html — keep it that way or clients desync.
- Crowd layout is rebuilt each round from a seed; clients catch up by stepping
  ticks. Stag position, hits, knockdown outcomes and wins come from the server.
- Single player runs the identical client with local authority; the Daily Stag
  option is solo-only.
