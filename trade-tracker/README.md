# BearTec AI Trade Tracker

Always-on worker for Discord / AI desk setups:

- Tracks entry → TP1 (close **50%**) → move stop to **break-even** → TP2 (close remaining **50%**) or SL/BE
- Discord level pings on each event
- Performance: win rate, R, PF, max DD, recovery, Sharpe, Sortino
- Sunday 18:00 UTC weekly recap

## Host

Designed for spare server `5.78.142.246` (`/opt/trade-tracker`, port **3101**).

## Deploy

```bash
# from laptop / build agent
rsync -az --delete ./trade-tracker/ root@5.78.142.246:/opt/trade-tracker/
ssh root@5.78.142.246 'bash /opt/trade-tracker/deploy/install.sh'
```

Set Discord:

```bash
ssh root@5.78.142.246
# edit DISCORD_WEBHOOK_URL=
nano /etc/trade-tracker.env
systemctl restart trade-tracker
```

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | status |
| GET | `/api/trades?active=1` | list |
| GET | `/api/performance` | stats |
| POST | `/api/trades` | register setup(s) (`X-Tracker-Key`) |
| POST | `/api/tick` | force poll |
| POST | `/api/weekly` | force Sunday report |

## E2E

```bash
export DATABASE_URL=...
npm run e2e
```
