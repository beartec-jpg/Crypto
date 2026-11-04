Backtest research for the Tether Divergence indicator (not Tide Zone). Read `REPORT.md` first.

Reproduce (Python 3 + numpy; needs Binance 1h kline npz files in `$TIDE_GRID_DATA`, e.g. from the `research/tide-backtest-grid` harness):

    python3 fetch_usdtd.py && python3 build_usdtd.py      # Coin Metrics USDT.D proxy -> data/usdtd_proxies.json (committed)
    TIDE_GRID_DATA=/path/to/klines python3 part1.py wide  # ladder
    TIDE_GRID_DATA=/path/to/klines python3 part2.py wide  # sweep
    python3 make_tables.py                                # results/tables.md
    python3 parity.py                                     # Python vs repo TS (run inside the repo)

Research only: no production code is changed.
