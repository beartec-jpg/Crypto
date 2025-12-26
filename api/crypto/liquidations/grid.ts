import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const symbol = (req.query.symbol as string)?.toUpperCase() || 'XRPUSDT';
    const binanceSymbol = symbol.replace('-', '');
    
    // Fetch 180 4-hour candles (30 days) - try global first, then US
    const binanceUrls = [
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=4h&limit=180`,
      `https://api.binance.us/api/v3/klines?symbol=${binanceSymbol}&interval=4h&limit=180`
    ];
    
    let binanceData = null;
    let lastError = null;
    
    for (const binanceUrl of binanceUrls) {
      try {
        const binanceResponse = await fetch(binanceUrl, { signal: AbortSignal.timeout(5000) });
        if (binanceResponse.ok) {
          binanceData = await binanceResponse.json();
          if (Array.isArray(binanceData) && binanceData.length > 0) {
            console.log(`✅ Binance data fetched from ${binanceUrl.includes('.com') ? 'global' : 'US'} API`);
            break;
          }
        }
      } catch (err: any) {
        lastError = err;
        console.log(`⚠️ Binance ${binanceUrl.includes('.com') ? 'global' : 'US'} API failed: ${err.message}`);
      }
    }
    
    if (!binanceData || !Array.isArray(binanceData) || binanceData.length === 0) {
      throw lastError || new Error('All Binance APIs failed');
    }
    
    // Convert to price candles
    const priceCandles = binanceData.map((candle: any) => ({
      time: candle[0] / 1000,
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
    
    // Get min/max price for adaptive bands
    const prices = priceCandles.map((c: any) => c.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    
    // Create 30 price bands
    const NUM_PRICE_BANDS = 30;
    const priceBandHeight = priceRange / NUM_PRICE_BANDS;
    
    // Aggregate candles into 30 daily buckets
    const NUM_TIME_BUCKETS = 30;
    const candlesPerBucket = Math.floor(priceCandles.length / NUM_TIME_BUCKETS);
    
    // Fetch liquidation data
    const coinalyzeApiKey = process.env.COINALYZE_API_KEY;
    const coinglassApiKey = process.env.COINGLASS_API_KEY;
    const coinalyzeSymbol = `${binanceSymbol}_PERP.A`;
    const to = Math.floor(Date.now() / 1000);
    const from = to - (30 * 24 * 60 * 60);
    
    let liquidations: any[] = [];
    
    // Try Coinalyze first
    if (coinalyzeApiKey) {
      try {
        const liqUrl = `https://api.coinalyze.net/v1/liquidation-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;
        const liqResponse = await fetch(liqUrl, {
          headers: { 'Accept': 'application/json', 'api_key': coinalyzeApiKey }
        });
        
        if (liqResponse.ok) {
          const liqData = await liqResponse.json();
          liquidations = liqData[0]?.history || [];
        }
      } catch (err) {
        console.log('Coinalyze error, trying CoinGlass...');
      }
    }
    
    // Fallback to CoinGlass
    if (liquidations.length === 0 && coinglassApiKey) {
      try {
        const cgLiqUrl = `https://open-api-v4.coinglass.com/api/futures/liquidation/history?exchange=Binance&symbol=${binanceSymbol}&interval=4h&limit=180`;
        
        const cgResponse = await fetch(cgLiqUrl, {
          headers: { 'accept': 'application/json', 'CG-API-KEY': coinglassApiKey }
        });
        
        if (cgResponse.ok) {
          const cgData = await cgResponse.json();
          if (cgData.code === '0' && cgData.data?.length > 0) {
            liquidations = cgData.data.map((item: any) => ({
              t: item.time / 1000,
              l: parseFloat(item.long_liquidation_usd) || 0,
              s: parseFloat(item.short_liquidation_usd) || 0
            }));
          }
        }
      } catch (err) {
        console.log('CoinGlass liquidation fallback failed');
      }
    }
    
    // Create 30×30 grid
    const grid: number[][] = Array(NUM_PRICE_BANDS).fill(0).map(() => 
      Array(NUM_TIME_BUCKETS).fill(0)
    );
    
    // Map liquidations to grid cells
    liquidations.forEach((liq: any) => {
      const liqTime = liq.t;
      const totalLiq = (liq.l || 0) + (liq.s || 0);
      
      if (totalLiq <= 0) return;
      
      let closestCandle = priceCandles[0];
      let minDiff = Math.abs(priceCandles[0].time - liqTime);
      
      for (const candle of priceCandles) {
        const diff = Math.abs(candle.time - liqTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestCandle = candle;
        }
      }
      
      const priceAtTime = closestCandle.close;
      const priceBandIdx = Math.floor((priceAtTime - minPrice) / priceBandHeight);
      const validPriceBand = Math.max(0, Math.min(NUM_PRICE_BANDS - 1, priceBandIdx));
      
      const candleIdx = priceCandles.findIndex((c: any) => c.time === closestCandle.time);
      const timeBucketIdx = Math.floor(candleIdx / candlesPerBucket);
      const validTimeBucket = Math.max(0, Math.min(NUM_TIME_BUCKETS - 1, timeBucketIdx));
      
      grid[validPriceBand][validTimeBucket] += totalLiq;
    });
    
    // Find max volume for color scaling
    let maxVolume = 0;
    grid.forEach(row => {
      row.forEach(val => {
        if (val > maxVolume) maxVolume = val;
      });
    });
    
    // Aggregate price data into 30 buckets
    const priceLine: Array<{time: number; price: number; high: number; low: number}> = [];
    for (let i = 0; i < NUM_TIME_BUCKETS; i++) {
      const startIdx = i * candlesPerBucket;
      const endIdx = Math.min(startIdx + candlesPerBucket, priceCandles.length);
      const bucketCandles = priceCandles.slice(startIdx, endIdx);
      
      if (bucketCandles.length > 0) {
        const avgTime = bucketCandles.reduce((sum: number, c: any) => sum + c.time, 0) / bucketCandles.length;
        const avgPrice = bucketCandles.reduce((sum: number, c: any) => sum + c.close, 0) / bucketCandles.length;
        const high = Math.max(...bucketCandles.map((c: any) => c.high));
        const low = Math.min(...bucketCandles.map((c: any) => c.low));
        
        priceLine.push({ time: avgTime, price: avgPrice, high, low });
      }
    }
    
    // Generate predicted liquidation column
    const predictedColumn: number[] = Array(NUM_PRICE_BANDS).fill(0);
    
    const bandDensity: number[] = Array(NUM_PRICE_BANDS).fill(0);
    grid.forEach((row, priceIdx) => {
      const totalVolumeInBand = row.reduce((sum, val) => sum + val, 0);
      bandDensity[priceIdx] = totalVolumeInBand;
    });
    
    const bandIndices = bandDensity.map((_, idx) => idx);
    const topBands = bandIndices.sort((a, b) => bandDensity[b] - bandDensity[a]).slice(0, 8);
    
    // Add leverage-based predictions
    const leverageLevels = [10, 25, 50, 100];
    const currentPrice = priceCandles[priceCandles.length - 1].close;
    
    leverageLevels.forEach(leverage => {
      const longLiqPrice = currentPrice * (1 - 1/leverage);
      const longBandIdx = Math.floor((longLiqPrice - minPrice) / priceBandHeight);
      const validLongBand = Math.max(0, Math.min(NUM_PRICE_BANDS - 1, longBandIdx));
      
      const shortLiqPrice = currentPrice * (1 + 1/leverage);
      const shortBandIdx = Math.floor((shortLiqPrice - minPrice) / priceBandHeight);
      const validShortBand = Math.max(0, Math.min(NUM_PRICE_BANDS - 1, shortBandIdx));
      
      const weight = leverage * 50000;
      predictedColumn[validLongBand] += weight;
      predictedColumn[validShortBand] += weight;
    });
    
    topBands.forEach((bandIdx) => {
      const weight = bandDensity[bandIdx] * 0.3;
      predictedColumn[bandIdx] += weight;
    });
    
    // Generate orderbook column using CoinGlass
    const orderbookColumn: number[] = Array(NUM_PRICE_BANDS).fill(0);
    
    if (coinglassApiKey) {
      try {
        const coinglassSymbol = symbol.replace('USDT', '');
        console.log(`📊 Fetching CoinGlass orderbook for: ${coinglassSymbol}`);
        // Fixed 4h interval - ignores page timeframe setting
        const orderbookUrl = `https://open-api-v4.coinglass.com/api/futures/orderbook/aggregated-ask-bids-history?exchange_list=Binance&symbol=${coinglassSymbol}&interval=4h&range=2&limit=30`;
        
        const orderbookResponse = await fetch(orderbookUrl, {
          headers: { 'accept': 'application/json', 'CG-API-KEY': coinglassApiKey },
          signal: AbortSignal.timeout(10000)
        });
        
        console.log(`📊 CoinGlass orderbook response status: ${orderbookResponse.status}`);
        
        if (orderbookResponse.ok) {
          const orderbookData = await orderbookResponse.json();
          console.log(`📊 CoinGlass orderbook response: code=${orderbookData.code}, msg=${orderbookData.msg}, data count=${orderbookData.data?.length || 0}`);
          
          if (orderbookData.code === '0' && orderbookData.data?.length > 0) {
            const orderbookHistory = orderbookData.data;
            console.log(`✅ CoinGlass orderbook data received: ${orderbookHistory.length} points`);
            
            orderbookHistory.forEach((item: any) => {
              const bids = item.aggregated_bids_usd || 0;
              const asks = item.aggregated_asks_usd || 0;
              const timestamp = item.time / 1000;
              
              let closestCandle = priceCandles[0];
              let minDiff = Math.abs(priceCandles[0].time - timestamp);
              
              for (const candle of priceCandles) {
                const diff = Math.abs(candle.time - timestamp);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestCandle = candle;
                }
              }
              
              const priceAtTime = closestCandle.close;
              const total = bids + asks;
              if (total === 0) return;
              
              const bidRatio = bids / total;
              const imbalanceStrength = Math.abs(bidRatio - 0.5) * 2;
              
              if (imbalanceStrength > 0.1) {
                const priceBandIdx = Math.floor((priceAtTime - minPrice) / priceBandHeight);
                const validBand = Math.max(0, Math.min(NUM_PRICE_BANDS - 1, priceBandIdx));
                
                const weight = total * imbalanceStrength;
                orderbookColumn[validBand] += weight;
                
                for (let offset = -1; offset <= 1; offset++) {
                  const nearbyBand = validBand + offset;
                  if (nearbyBand >= 0 && nearbyBand < NUM_PRICE_BANDS && offset !== 0) {
                    orderbookColumn[nearbyBand] += weight * 0.3;
                  }
                }
              }
            });
            
            // Log how much data was populated
            const nonZeroCount = orderbookColumn.filter(v => v > 0).length;
            console.log(`✅ Orderbook column populated: ${nonZeroCount} non-zero bands`);
          } else {
            console.log(`⚠️ CoinGlass orderbook: Invalid response or no data`);
          }
        } else {
          console.log(`⚠️ CoinGlass orderbook failed: ${orderbookResponse.status} ${orderbookResponse.statusText}`);
        }
      } catch (error: any) {
        console.error('❌ Failed to fetch orderbook data:', error.message);
      }
    } else {
      console.log('⚠️ No CoinGlass API key for orderbook');
    }
    
    res.json({
      symbol,
      grid,
      priceLine,
      predictedColumn,
      orderbookColumn,
      minPrice,
      maxPrice,
      maxVolume,
      numPriceBands: NUM_PRICE_BANDS,
      numTimeBuckets: NUM_TIME_BUCKETS,
      timestamp: Date.now()
    });
    
  } catch (error: any) {
    console.error('Error generating liquidation grid:', error);
    res.status(500).json({
      error: 'Failed to generate liquidation grid',
      details: error.message
    });
  }
}
