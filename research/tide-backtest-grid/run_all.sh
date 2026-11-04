#!/bin/bash
cd ~/scratch/tide-backtest/tide-backtest-grid
tf=$1
for s in 1 2 3 4 5 6; do
  nice -n 19 ionice -c3 python3 grid.py --tf $tf --stage $s --workers 10 >> run_$tf.log 2>&1 || { echo "FAILED stage $s" >> run_$tf.log; exit 1; }
done
echo ALLDONE >> run_$tf.log
