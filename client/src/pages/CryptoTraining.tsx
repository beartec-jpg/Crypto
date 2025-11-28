import { Helmet } from 'react-helmet-async';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ArrowLeft, GraduationCap, TrendingUp, Activity, BarChart3, Zap } from 'lucide-react';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import { CryptoNavigation } from '@/components/CryptoNavigation';

export default function CryptoTraining() {
  return (
    <>
      <Helmet>
        <title>Crypto Trading Training - Learn SMC & Order Flow | BearTec</title>
        <meta name="description" content="Comprehensive cryptocurrency trading training covering Smart Money Concepts, order flow analysis, technical indicators, CVD, RSI, MACD, and institutional trading techniques. Learn professional crypto analysis." />
        <meta property="og:title" content="Crypto Trading Training - Learn SMC & Order Flow" />
        <meta property="og:description" content="Learn Smart Money Concepts, order flow, and professional crypto trading techniques." />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="min-h-screen bg-[#0e0e0e] text-white p-6 pb-20">
        <div className="max-w-[1400px] mx-auto space-y-6">
          {/* BearTec Logo - Top Center */}
        <div className="flex justify-center mb-8">
          <img 
            src={bearTecLogoNew} 
            alt="BearTec Logo" 
            className="h-[140px] w-auto object-contain"
          />
        </div>

        {/* Back Button */}
        <Link href="/cryptoindicators">
          <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Indicators
          </Button>
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <GraduationCap className="w-8 h-8 text-[#00c4b4]" />
          <h1 className="text-3xl font-bold">Trading Analysis Training</h1>
        </div>

        <p className="text-gray-400 text-base mb-8">
          Comprehensive guide to understanding and using technical indicators, oscillators, and order flow analysis tools
        </p>

        <div className="space-y-8">
          {/* OSCILLATORS SECTION */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-[#2a2e39] pb-3">
              <Activity className="w-6 h-6 text-purple-500" />
              <h2 className="text-2xl font-bold">Oscillators</h2>
            </div>

            {/* RSI */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  RSI (Relative Strength Index)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Momentum oscillator that measures the speed and magnitude of price changes. Ranges from 0-100, identifying overbought and oversold conditions.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Variable</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Default</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Description</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">How to Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Period</td>
                        <td className="p-3 text-white">14</td>
                        <td className="p-3 text-gray-300">Number of periods for calculation</td>
                        <td className="p-3 text-gray-300">Higher = smoother but slower, Lower = more sensitive</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Overbought</td>
                        <td className="p-3 text-white">70</td>
                        <td className="p-3 text-gray-300">Upper threshold indicating overextension</td>
                        <td className="p-3 text-gray-300">Above 70 = Potential reversal down, watch for bearish signals</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Oversold</td>
                        <td className="p-3 text-white">30</td>
                        <td className="p-3 text-gray-300">Lower threshold indicating underextension</td>
                        <td className="p-3 text-gray-300">Below 30 = Potential reversal up, watch for bullish signals</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Trading Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Divergence:</strong> Price makes lower low but RSI makes higher low = Bullish reversal signal</li>
                    <li><strong>Centerline Crossover:</strong> RSI crosses above 50 = Bullish momentum, below 50 = Bearish momentum</li>
                    <li><strong>Failure Swing:</strong> RSI fails to break previous high/low = Reversal warning</li>
                    <li><strong>Trend Confirmation:</strong> RSI stays above 40 in uptrends, below 60 in downtrends</li>
                  </ul>
                </div>

                <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-lg">
                  <p className="text-yellow-400 text-xs font-semibold">⚠️ Important Note:</p>
                  <p className="text-gray-300 text-xs mt-1">
                    Overbought doesn't mean "sell" - strong trends can stay overbought for extended periods. Always combine with price action and other indicators.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* MACD */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  MACD (Moving Average Convergence Divergence)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Trend-following momentum indicator showing the relationship between two moving averages. Consists of MACD line, signal line, and histogram.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Variable</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Default</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Description</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">How to Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Fast EMA</td>
                        <td className="p-3 text-white">12</td>
                        <td className="p-3 text-gray-300">Fast exponential moving average period</td>
                        <td className="p-3 text-gray-300">Shorter period = more responsive to recent price changes</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Slow EMA</td>
                        <td className="p-3 text-white">26</td>
                        <td className="p-3 text-gray-300">Slow exponential moving average period</td>
                        <td className="p-3 text-gray-300">Longer period = smoother, filters noise</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Signal Line</td>
                        <td className="p-3 text-white">9</td>
                        <td className="p-3 text-gray-300">EMA of MACD line</td>
                        <td className="p-3 text-gray-300">Crossovers generate buy/sell signals</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Histogram</td>
                        <td className="p-3 text-white">Auto</td>
                        <td className="p-3 text-gray-300">Difference between MACD and signal line</td>
                        <td className="p-3 text-gray-300">Measures momentum strength - growing bars = increasing momentum</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Trading Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Signal Line Crossover:</strong> MACD crosses above signal = Buy, crosses below = Sell</li>
                    <li><strong>Zero Line Crossover:</strong> MACD crosses above 0 = Bullish trend confirmation, below 0 = Bearish</li>
                    <li><strong>Divergence:</strong> Price diverges from MACD = Potential reversal (most reliable signal)</li>
                    <li><strong>Histogram Peak/Trough:</strong> Histogram shrinking after peak = Momentum weakening, potential reversal</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* OBV */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  OBV (On-Balance Volume)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Cumulative volume indicator that adds volume on up days and subtracts volume on down days. Measures buying and selling pressure.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Component</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Calculation</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Interpretation</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Trading Signal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Rising OBV</td>
                        <td className="p-3 text-white">+Volume on up days</td>
                        <td className="p-3 text-gray-300">Accumulation phase</td>
                        <td className="p-3 text-green-400">Bullish - Buying pressure increasing</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Falling OBV</td>
                        <td className="p-3 text-white">-Volume on down days</td>
                        <td className="p-3 text-gray-300">Distribution phase</td>
                        <td className="p-3 text-red-400">Bearish - Selling pressure increasing</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Flat OBV</td>
                        <td className="p-3 text-white">Balanced volume</td>
                        <td className="p-3 text-gray-300">Consolidation</td>
                        <td className="p-3 text-yellow-400">Neutral - Wait for breakout</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Trading Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Trend Confirmation:</strong> Price and OBV both rising = Strong uptrend, both falling = Strong downtrend</li>
                    <li><strong>Divergence:</strong> Price makes new high but OBV doesn't = Bearish divergence (very powerful)</li>
                    <li><strong>Breakout Confirmation:</strong> OBV breaks out before price = Early warning of move</li>
                    <li><strong>Support/Resistance:</strong> OBV can form its own support/resistance levels</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* MFI */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
                  MFI (Money Flow Index)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Volume-weighted RSI that measures buying and selling pressure using both price and volume. Ranges from 0-100.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Variable</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Default</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Description</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">How to Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Period</td>
                        <td className="p-3 text-white">14</td>
                        <td className="p-3 text-gray-300">Lookback period for calculation</td>
                        <td className="p-3 text-gray-300">Standard period, lower = more sensitive</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Overbought</td>
                        <td className="p-3 text-white">80</td>
                        <td className="p-3 text-gray-300">Upper extreme threshold</td>
                        <td className="p-3 text-gray-300">Above 80 = Excessive buying, potential reversal down</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Oversold</td>
                        <td className="p-3 text-white">20</td>
                        <td className="p-3 text-gray-300">Lower extreme threshold</td>
                        <td className="p-3 text-gray-300">Below 20 = Excessive selling, potential reversal up</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Trading Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Overbought/Oversold:</strong> MFI &gt; 80 = Look for shorts, MFI &lt; 20 = Look for longs</li>
                    <li><strong>Divergence:</strong> Price makes new high but MFI lower = Bearish (reliable reversal signal)</li>
                    <li><strong>Failure Swing:</strong> MFI moves above 80 twice without price breaking high = Top reversal</li>
                    <li><strong>Combined with RSI:</strong> Both oversold = High probability reversal setup</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Stochastic RSI */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  Stochastic RSI
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  More sensitive version of RSI that applies the Stochastic formula to RSI values. Provides earlier signals than standard RSI by measuring RSI relative to its high-low range.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Variable</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Default</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Description</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">How to Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">RSI Period</td>
                        <td className="p-3 text-white">14</td>
                        <td className="p-3 text-gray-300">Period for RSI calculation</td>
                        <td className="p-3 text-gray-300">Standard RSI lookback period</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Stochastic Period</td>
                        <td className="p-3 text-white">14</td>
                        <td className="p-3 text-gray-300">Period for Stochastic calculation</td>
                        <td className="p-3 text-gray-300">Lookback for RSI high-low range</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">K Smoothing</td>
                        <td className="p-3 text-white">3</td>
                        <td className="p-3 text-gray-300">Smoothing for %K line</td>
                        <td className="p-3 text-gray-300">Higher = smoother %K line</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">D Smoothing</td>
                        <td className="p-3 text-white">3</td>
                        <td className="p-3 text-gray-300">Smoothing for %D signal line</td>
                        <td className="p-3 text-gray-300">%D is the moving average of %K</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Trading Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Crossover:</strong> %K crosses above %D = Bullish signal, %K crosses below %D = Bearish signal</li>
                    <li><strong>Overbought/Oversold:</strong> Above 80 = Overbought, Below 20 = Oversold (more sensitive than RSI)</li>
                    <li><strong>Divergence:</strong> Price makes new high but StochRSI doesn't = Early warning of reversal</li>
                    <li><strong>Mid-line Cross:</strong> Crosses above 50 = Momentum shift bullish, below 50 = Bearish</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Williams %R */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                  Williams %R
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Momentum oscillator that measures overbought and oversold levels, similar to Stochastic but inverted. Ranges from -100 to 0 (note: inverted scale where -100 is oversold, 0 is overbought).
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Variable</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Default</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Description</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">How to Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Period</td>
                        <td className="p-3 text-white">14</td>
                        <td className="p-3 text-gray-300">Lookback period for high-low range</td>
                        <td className="p-3 text-gray-300">Standard period, lower = more responsive</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Overbought</td>
                        <td className="p-3 text-white">-20</td>
                        <td className="p-3 text-gray-300">Upper threshold (closer to 0)</td>
                        <td className="p-3 text-gray-300">Above -20 = Overbought condition</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Oversold</td>
                        <td className="p-3 text-white">-80</td>
                        <td className="p-3 text-gray-300">Lower threshold (closer to -100)</td>
                        <td className="p-3 text-gray-300">Below -80 = Oversold condition</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Trading Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Overbought Exit:</strong> %R moves above -20 then drops below = Sell signal</li>
                    <li><strong>Oversold Entry:</strong> %R moves below -80 then rises above = Buy signal</li>
                    <li><strong>Failure Swing:</strong> %R fails to reach previous extreme = Momentum weakening</li>
                    <li><strong>Trend Confirmation:</strong> In uptrends, %R rarely goes below -80; in downtrends, rarely above -20</li>
                  </ul>
                </div>

                <div className="bg-blue-900/20 border border-blue-700/50 p-3 rounded-lg">
                  <p className="text-blue-400 text-xs font-semibold">💡 Pro Tip:</p>
                  <p className="text-gray-300 text-xs mt-1">
                    Williams %R is essentially an inverted Stochastic. The inverted scale can be confusing at first - remember that 0 is at the top (overbought) and -100 is at the bottom (oversold).
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* CCI */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-teal-500"></div>
                  CCI (Commodity Channel Index)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Measures the current price level relative to an average price level over a given period. Values above +100 indicate overbought, below -100 indicate oversold. Originally designed for commodities but works on all markets.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Variable</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Default</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Description</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">How to Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Period</td>
                        <td className="p-3 text-white">20</td>
                        <td className="p-3 text-gray-300">Lookback period for calculation</td>
                        <td className="p-3 text-gray-300">Standard period, lower = more volatile readings</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Overbought</td>
                        <td className="p-3 text-white">+100</td>
                        <td className="p-3 text-gray-300">Upper extreme level</td>
                        <td className="p-3 text-gray-300">CCI &gt; +100 = Price significantly above average</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Oversold</td>
                        <td className="p-3 text-white">-100</td>
                        <td className="p-3 text-gray-300">Lower extreme level</td>
                        <td className="p-3 text-gray-300">CCI &lt; -100 = Price significantly below average</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Trading Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Zero Line Cross:</strong> CCI crosses above 0 = Bullish momentum, below 0 = Bearish</li>
                    <li><strong>Extreme Readings:</strong> CCI &gt; +100 then drops below = Sell signal; CCI &lt; -100 then rises above = Buy signal</li>
                    <li><strong>Trend Trading:</strong> Stay long while CCI &gt; 0 in uptrends, short while CCI &lt; 0 in downtrends</li>
                    <li><strong>Divergence:</strong> Price makes new high but CCI makes lower high = Bearish divergence</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* ADX */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  ADX (Average Directional Index)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Measures trend STRENGTH, not direction. Ranges from 0-100. Unlike other oscillators, ADX tells you HOW STRONG a trend is, not whether to buy or sell. High ADX means strong trend (either direction), low ADX means ranging/choppy market.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">ADX Value</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Trend Strength</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Trading Implication</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Strategy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-white font-mono">0-20</td>
                        <td className="p-3 text-red-400">Weak/No Trend</td>
                        <td className="p-3 text-gray-300">Market is ranging, choppy</td>
                        <td className="p-3 text-gray-300">Avoid trend strategies, use range trading</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-white font-mono">20-25</td>
                        <td className="p-3 text-yellow-400">Emerging Trend</td>
                        <td className="p-3 text-gray-300">Trend may be starting</td>
                        <td className="p-3 text-gray-300">Watch for breakout confirmation</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-white font-mono">25-50</td>
                        <td className="p-3 text-green-400">Strong Trend</td>
                        <td className="p-3 text-gray-300">Good trending conditions</td>
                        <td className="p-3 text-gray-300">Follow the trend, use pullback entries</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-white font-mono">50-75</td>
                        <td className="p-3 text-blue-400">Very Strong Trend</td>
                        <td className="p-3 text-gray-300">Powerful momentum</td>
                        <td className="p-3 text-gray-300">Stay with trend, trail stops</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-white font-mono">75-100</td>
                        <td className="p-3 text-purple-400">Extreme Trend</td>
                        <td className="p-3 text-gray-300">Rare, often unsustainable</td>
                        <td className="p-3 text-gray-300">Watch for exhaustion, tighten stops</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Trading Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Trend Filter:</strong> Only take trades in direction of trend when ADX &gt; 25</li>
                    <li><strong>Range Detection:</strong> ADX &lt; 20 = Use mean reversion strategies, not trend following</li>
                    <li><strong>Breakout Confirmation:</strong> ADX rising above 25 = Trend breakout confirmed</li>
                    <li><strong>Trend Exhaustion:</strong> ADX peaks and turns down = Trend may be weakening</li>
                  </ul>
                </div>

                <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-lg">
                  <p className="text-yellow-400 text-xs font-semibold">⚠️ Important Note:</p>
                  <p className="text-gray-300 text-xs mt-1">
                    ADX only measures trend strength, NOT direction. A high ADX reading could mean a strong uptrend OR a strong downtrend. Use +DI/-DI lines or price action to determine direction.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Bollinger Bands */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  Bollinger Bands
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Volatility indicator consisting of three lines: a middle band (SMA) and upper/lower bands set at standard deviations above and below. Measures price volatility and identifies overbought/oversold conditions.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Variable</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Default</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Description</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">How to Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Period</td>
                        <td className="p-3 text-white">20</td>
                        <td className="p-3 text-gray-300">Periods for SMA calculation</td>
                        <td className="p-3 text-gray-300">Higher = smoother, Lower = more reactive to price changes</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Std Dev</td>
                        <td className="p-3 text-white">2.0</td>
                        <td className="p-3 text-gray-300">Standard deviations for bands</td>
                        <td className="p-3 text-gray-300">Higher = wider bands, Lower = tighter bands (more signals)</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Upper Band</td>
                        <td className="p-3 text-white">SMA + (2 × σ)</td>
                        <td className="p-3 text-gray-300">Resistance / overbought zone</td>
                        <td className="p-3 text-gray-300">Price touching = potential reversal or strong momentum</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Lower Band</td>
                        <td className="p-3 text-white">SMA - (2 × σ)</td>
                        <td className="p-3 text-gray-300">Support / oversold zone</td>
                        <td className="p-3 text-gray-300">Price touching = potential reversal or strong momentum</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Trading Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Band Squeeze:</strong> Bands tighten (low volatility) = Big move coming soon. Watch for breakout direction</li>
                    <li><strong>Band Touch:</strong> Price touches upper band = Overbought (look for reversal), touches lower = Oversold</li>
                    <li><strong>Breakout Trading:</strong> Price closes ABOVE upper band = Strong bullish momentum, BELOW lower = Strong bearish</li>
                    <li><strong>Middle Band Cross:</strong> Price crosses SMA = Trend change. Above SMA = Bullish, Below = Bearish</li>
                    <li><strong>Walking the Bands:</strong> In strong trends, price "walks" along upper (uptrend) or lower (downtrend) band</li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-green-900/20 border border-green-700/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-400 mb-2">Bullish Signals</h4>
                    <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                      <li>Price bounces off lower band</li>
                      <li>Price breaks above upper band (momentum)</li>
                      <li>Price crosses above middle band (SMA)</li>
                      <li>Bands squeeze then expand upward</li>
                    </ul>
                  </div>
                  <div className="bg-red-900/20 border border-red-700/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-red-400 mb-2">Bearish Signals</h4>
                    <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                      <li>Price rejects at upper band</li>
                      <li>Price breaks below lower band (momentum)</li>
                      <li>Price crosses below middle band (SMA)</li>
                      <li>Bands squeeze then expand downward</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-yellow-900/20 border border-yellow-700/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-yellow-400 mb-2">⚠️ Important Notes</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li>Bands are NOT hard support/resistance - price can touch/break them multiple times</li>
                    <li>In strong trends, "overbought" at upper band doesn't mean reversal - could continue higher</li>
                    <li>Best used with other indicators (RSI, volume) for confirmation</li>
                    <li>Wider bands (higher std dev) = fewer false signals but later entries</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SMART MONEY CONCEPTS SECTION */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-[#2a2e39] pb-3">
              <TrendingUp className="w-6 h-6 text-green-500" />
              <h2 className="text-2xl font-bold">Smart Money Concepts</h2>
            </div>

            {/* Order Blocks */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">Order Blocks (OB)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Price zones where institutional orders were placed, creating strong support/resistance. Formed by the last down candle before an up move (bullish OB) or last up candle before down move (bearish OB).
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-green-900/20 border border-green-700/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-400 mb-2">Bullish Order Block</h4>
                    <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                      <li>Last bearish candle before bullish move</li>
                      <li>Acts as demand zone</li>
                      <li>Price often retraces to OB before continuing up</li>
                      <li>Look for: Bounce, volume spike, bullish engulfing</li>
                    </ul>
                  </div>
                  <div className="bg-red-900/20 border border-red-700/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-red-400 mb-2">Bearish Order Block</h4>
                    <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                      <li>Last bullish candle before bearish move</li>
                      <li>Acts as supply zone</li>
                      <li>Price often retraces to OB before continuing down</li>
                      <li>Look for: Rejection, volume spike, bearish engulfing</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg">
                  <h4 className="font-semibold text-white mb-2">How to Trade:</h4>
                  <ol className="list-decimal list-inside text-gray-300 space-y-1 text-sm">
                    <li>Identify strong impulsive move that broke structure</li>
                    <li>Mark the last opposite candle before the move</li>
                    <li>Wait for price to retrace to OB zone (50-75% of candle)</li>
                    <li>Look for confluence: FVG, volume, divergence</li>
                    <li>Enter on confirmation (engulfing, pin bar, etc.)</li>
                    <li>Stop loss just beyond OB, target next structure level</li>
                  </ol>
                </div>
              </CardContent>
            </Card>

            {/* FVG */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">Fair Value Gaps (FVG)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Imbalances in price action where a gap exists between candle 1's high/low and candle 3's low/high. Represents inefficient price delivery that market tends to fill.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Type</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Formation</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Expectation</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Trading Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-green-400 font-semibold">Bullish FVG</td>
                        <td className="p-3 text-gray-300">Gap between candle 1 high and candle 3 low</td>
                        <td className="p-3 text-gray-300">Price pulls back to fill gap</td>
                        <td className="p-3 text-gray-300">Buy when price enters FVG, stop below FVG</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-red-400 font-semibold">Bearish FVG</td>
                        <td className="p-3 text-gray-300">Gap between candle 1 low and candle 3 high</td>
                        <td className="p-3 text-gray-300">Price rallies back to fill gap</td>
                        <td className="p-3 text-gray-300">Sell when price enters FVG, stop above FVG</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Key Concepts:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Mitigation:</strong> FVG is "mitigated" when price fills 50% or more of the gap</li>
                    <li><strong>High-Value FVG:</strong> Formed with 2x+ average volume = More likely to hold</li>
                    <li><strong>Multiple FVGs:</strong> Nested FVGs create stronger support/resistance zones</li>
                    <li><strong>HTF FVGs:</strong> Higher timeframe FVGs (4H, Daily) more significant than 15m</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* BOS/CHoCH */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">BOS & CHoCH (Market Structure)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Market structure tools that identify trend continuation (BOS) and trend reversal (CHoCH) by analyzing swing highs and lows.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-900/20 border border-blue-700/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-400 mb-2">BOS (Break of Structure)</h4>
                    <p className="text-gray-300 text-sm mb-2">Trend continuation signal</p>
                    <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                      <li><strong>Bullish BOS:</strong> Price breaks above previous swing high</li>
                      <li><strong>Bearish BOS:</strong> Price breaks below previous swing low</li>
                      <li>Confirms trend is still strong</li>
                      <li>Enter pullbacks after BOS in trend direction</li>
                    </ul>
                  </div>
                  <div className="bg-orange-900/20 border border-orange-700/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-orange-400 mb-2">CHoCH (Change of Character)</h4>
                    <p className="text-gray-300 text-sm mb-2">Potential trend reversal signal</p>
                    <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                      <li><strong>Bullish CHoCH:</strong> In downtrend, price breaks above previous swing high</li>
                      <li><strong>Bearish CHoCH:</strong> In uptrend, price breaks below previous swing low</li>
                      <li>First sign of trend weakness</li>
                      <li>Wait for confirmation before reversing bias</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg">
                  <h4 className="font-semibold text-white mb-2">Variables You Can Adjust:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Swing Length:</strong> Number of candles to left/right for swing detection (default 5-10)</li>
                    <li><strong>Minimum % Move:</strong> Minimum breakout size to qualify as BOS/CHoCH (default 0.1%)</li>
                    <li><strong>Timeframe:</strong> Higher timeframes = more significant structure breaks</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Liquidity Sweeps */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">Liquidity Sweeps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Institutions deliberately push price through key levels to trigger stop losses and grab liquidity before reversing. One of the most powerful SMC concepts.
                </p>
                
                <div className="bg-yellow-900/20 border border-yellow-700/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-yellow-400 mb-2">Why Liquidity Sweeps Happen</h4>
                  <p className="text-gray-300 text-sm">
                    Retail traders place stops just above swing highs (shorts) or below swing lows (longs). Smart money knows this and sweeps these levels to:
                  </p>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm mt-2">
                    <li>Collect liquidity for large institutional orders</li>
                    <li>Trigger emotional exits before the real move</li>
                    <li>Create better entry prices for themselves</li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-green-900/20 border border-green-700/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-400 mb-2">Bullish Liquidity Sweep</h4>
                    <ol className="list-decimal list-inside text-gray-300 space-y-1 text-sm">
                      <li>Price sweeps below swing low (taking out buy stops)</li>
                      <li>Immediately reverses back above the low</li>
                      <li>Forms a wick/rejection candle</li>
                      <li><strong>Action:</strong> Enter long, stop below wick</li>
                    </ol>
                  </div>
                  <div className="bg-red-900/20 border border-red-700/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-red-400 mb-2">Bearish Liquidity Sweep</h4>
                    <ol className="list-decimal list-inside text-gray-300 space-y-1 text-sm">
                      <li>Price sweeps above swing high (taking out sell stops)</li>
                      <li>Immediately reverses back below the high</li>
                      <li>Forms a wick/rejection candle</li>
                      <li><strong>Action:</strong> Enter short, stop above wick</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ORDER FLOW SECTION */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-[#2a2e39] pb-3">
              <BarChart3 className="w-6 h-6 text-cyan-500" />
              <h2 className="text-2xl font-bold">Order Flow Analysis</h2>
            </div>

            {/* CVD */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">CVD (Cumulative Volume Delta)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Running total of buying volume minus selling volume. Shows whether buyers or sellers are in control over time. Most powerful when combined with price action.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Metric</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Calculation</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Bullish Signal</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Bearish Signal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Delta</td>
                        <td className="p-3 text-white">Buy Vol - Sell Vol</td>
                        <td className="p-3 text-green-400">Large positive delta</td>
                        <td className="p-3 text-red-400">Large negative delta</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">CVD Trend</td>
                        <td className="p-3 text-white">Sum of all deltas</td>
                        <td className="p-3 text-green-400">CVD rising with price</td>
                        <td className="p-3 text-red-400">CVD falling with price</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-mono">Divergence</td>
                        <td className="p-3 text-white">CVD vs Price direction</td>
                        <td className="p-3 text-green-400">Price down, CVD up</td>
                        <td className="p-3 text-red-400">Price up, CVD down</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Advanced CVD Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Absorption:</strong> Large sell volume but price doesn't fall = Buyers absorbing, bullish</li>
                    <li><strong>Exhaustion:</strong> Massive delta in one direction, then reversal = Climax move</li>
                    <li><strong>Hidden Divergence:</strong> Price makes higher high, CVD makes lower high = Bearish continuation</li>
                    <li><strong>Multi-Exchange CVD:</strong> Compare CVD across exchanges - divergence signals manipulation</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Volume Profile */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">Volume Profile & POC/VAH/VAL</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Horizontal histogram showing volume traded at each price level. Identifies where the most trading activity occurred, revealing key support/resistance.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Level</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Full Name</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Definition</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Trading Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-yellow-400 font-bold">POC</td>
                        <td className="p-3 text-white">Point of Control</td>
                        <td className="p-3 text-gray-300">Price level with highest volume</td>
                        <td className="p-3 text-gray-300">Strongest magnet - price tends to return here. Strong support/resistance.</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-green-400 font-bold">VAH</td>
                        <td className="p-3 text-white">Value Area High</td>
                        <td className="p-3 text-gray-300">Top of 70% volume range</td>
                        <td className="p-3 text-gray-300">Above VAH = Overvalued. Resistance zone. Short entries.</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-red-400 font-bold">VAL</td>
                        <td className="p-3 text-white">Value Area Low</td>
                        <td className="p-3 text-gray-300">Bottom of 70% volume range</td>
                        <td className="p-3 text-gray-300">Below VAL = Undervalued. Support zone. Long entries.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">Volume Profile Strategies:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>POC Bounce:</strong> Price pulls back to POC often provides excellent entry with tight stop</li>
                    <li><strong>Value Area Extremes:</strong> Buy at VAL, sell at VAH, target POC</li>
                    <li><strong>High Volume Nodes (HVN):</strong> Price consolidation areas = Strong support/resistance</li>
                    <li><strong>Low Volume Nodes (LVN):</strong> Price gaps through quickly = Weak support/resistance</li>
                    <li><strong>Volume Shelf:</strong> Thick horizontal volume = price likely to stall/reverse</li>
                  </ul>
                </div>

                <div className="bg-blue-900/20 border border-blue-700/50 p-3 rounded-lg">
                  <p className="text-blue-400 text-xs font-semibold">💡 Pro Tip:</p>
                  <p className="text-gray-300 text-xs mt-1">
                    The POC acts like a magnet. If price is below POC, it tends to get pulled back up. If above, tends to get pulled down. Use this for mean reversion trades.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* VWAP */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">VWAP (Volume Weighted Average Price)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Average price weighted by volume. Institutional benchmark - algorithms often use VWAP for execution. Resets daily.
                </p>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-semibold">Signal Type</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Condition</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Interpretation</th>
                        <th className="text-left p-3 text-gray-400 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-semibold">Bullish Cross</td>
                        <td className="p-3 text-white">Price crosses above VWAP</td>
                        <td className="p-3 text-gray-300">Buying pressure increasing</td>
                        <td className="p-3 text-green-400">Look for long entries, trend is up</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-semibold">Bearish Cross</td>
                        <td className="p-3 text-white">Price crosses below VWAP</td>
                        <td className="p-3 text-gray-300">Selling pressure increasing</td>
                        <td className="p-3 text-red-400">Look for short entries, trend is down</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-semibold">Bullish Bounce</td>
                        <td className="p-3 text-white">Price pulls back to VWAP and bounces</td>
                        <td className="p-3 text-gray-300">VWAP acting as support</td>
                        <td className="p-3 text-green-400">Enter long at VWAP, tight stop below</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-[#00c4b4] font-semibold">Bearish Rejection</td>
                        <td className="p-3 text-white">Price rallies to VWAP and rejects</td>
                        <td className="p-3 text-gray-300">VWAP acting as resistance</td>
                        <td className="p-3 text-red-400">Enter short at VWAP, tight stop above</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-white">VWAP Trading Rules:</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                    <li><strong>Trend Filter:</strong> Only long when price is above VWAP, only short when below</li>
                    <li><strong>Intraday Mean Reversion:</strong> Price far from VWAP tends to return to it</li>
                    <li><strong>VWAP Bands:</strong> Use standard deviation bands (±0.5%, ±1%) for extreme entries</li>
                    <li><strong>Multi-Timeframe:</strong> Daily VWAP more significant than 1H or 15m VWAP</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* EMA Trading Strategies */}
            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">EMA Trading Strategies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Exponential Moving Averages (EMAs) give more weight to recent prices, making them more responsive than simple moving averages. Popular for trend-following strategies.
                </p>
                
                <div className="space-y-4">
                  <div className="bg-slate-900 p-4 rounded-lg">
                    <h4 className="font-semibold text-white mb-3">Common EMA Combinations:</h4>
                    <div className="space-y-3">
                      <div className="border-l-4 border-blue-500 pl-3">
                        <p className="text-blue-400 font-semibold">9/21 EMA (Scalping & Day Trading)</p>
                        <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm mt-1">
                          <li>Fast signals - ideal for 5m-15m timeframes</li>
                          <li><strong>Buy:</strong> 9 EMA crosses above 21 EMA + price above both EMAs</li>
                          <li><strong>Sell:</strong> 9 EMA crosses below 21 EMA + price below both EMAs</li>
                          <li><strong>Trend Filter:</strong> Only long when 21 EMA is rising, only short when falling</li>
                        </ul>
                      </div>

                      <div className="border-l-4 border-green-500 pl-3">
                        <p className="text-green-400 font-semibold">20/50 EMA (Swing Trading)</p>
                        <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm mt-1">
                          <li>Balanced approach - works on 1H-4H timeframes</li>
                          <li><strong>Entry:</strong> Wait for price to pull back to 20 EMA in uptrend, bounce = long</li>
                          <li><strong>Confirmation:</strong> Both EMAs must be aligned (20 above 50 for longs)</li>
                          <li><strong>Stop Loss:</strong> Just below 50 EMA for added protection</li>
                        </ul>
                      </div>

                      <div className="border-l-4 border-purple-500 pl-3">
                        <p className="text-purple-400 font-semibold">50/100/200 EMA (Position Trading)</p>
                        <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm mt-1">
                          <li>Long-term trend following - Daily/Weekly timeframes</li>
                          <li><strong>Triple EMA Stack:</strong> 50 &gt; 100 &gt; 200 = Strong uptrend</li>
                          <li><strong>Golden Cross:</strong> 50 EMA crosses above 200 EMA = Major bullish signal</li>
                          <li><strong>Death Cross:</strong> 50 EMA crosses below 200 EMA = Major bearish signal</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-900/20 border border-blue-700/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-white mb-2">Advanced EMA Strategies:</h4>
                    <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                      <li><strong>EMA Ribbon:</strong> Use 8-13-21-34-55 EMAs together - when all aligned = very strong trend</li>
                      <li><strong>Dynamic Support/Resistance:</strong> Price bouncing off 21 EMA repeatedly = strong trend</li>
                      <li><strong>EMA Pullback Entry:</strong> In uptrend, buy when price touches 9/21 EMA and shows bullish candle</li>
                      <li><strong>Multi-Timeframe Confluence:</strong> Daily 50 EMA + 4H 20 EMA aligned = high-probability zone</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-lg">
                    <p className="text-yellow-400 text-xs font-semibold">⚠️ Common Mistakes:</p>
                    <p className="text-gray-300 text-xs mt-1">
                      Don't trade EMA crosses blindly in choppy/sideways markets - wait for clear trend. Use RSI or MACD for confirmation in ranging conditions.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* REPLAY MODE SECTION */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-[#2a2e39] pb-3">
              <BarChart3 className="w-6 h-6 text-cyan-500" />
              <h2 className="text-2xl font-bold">Replay Mode (Historical Playback)</h2>
            </div>

            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">How to Use Replay Mode</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Replay Mode allows you to "replay" historical price action candle-by-candle, helping you practice trading decisions, backtest strategies, and understand how indicators work in real market conditions.
                </p>
                
                <div className="space-y-4">
                  <div className="bg-slate-900 p-4 rounded-lg">
                    <h4 className="font-semibold text-white mb-3">Step-by-Step Guide:</h4>
                    <ol className="list-decimal list-inside text-gray-300 space-y-2 text-sm">
                      <li><strong>Navigate to Chart Page:</strong> Go to the main indicators page and locate the replay controls</li>
                      <li><strong>Select Symbol & Timeframe:</strong> Choose your crypto pair (BTC, ETH, XRP, etc.) and desired timeframe</li>
                      <li><strong>Enable Replay Mode:</strong> Toggle the "Replay Mode" switch to activate historical playback</li>
                      <li><strong>Choose Playback Speed:</strong> Select from 1x (real-time), 2x, 5x, or 10x speed</li>
                      <li><strong>Start Playback:</strong> Click Play to watch candles form one by one</li>
                      <li><strong>Pause & Analyze:</strong> Hit pause at any point to study the setup and make trading decisions</li>
                      <li><strong>Reset:</strong> Use the reset button to start over from the beginning of the historical data</li>
                    </ol>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-green-900/20 border border-green-700/50 p-4 rounded-lg">
                      <h4 className="font-semibold text-green-400 mb-2">Best Practices</h4>
                      <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                        <li>Start with 1x speed to see candles form naturally</li>
                        <li>Take notes of your trade decisions before seeing the outcome</li>
                        <li>Track win rate and quality of your entries</li>
                        <li>Focus on one strategy at a time (e.g., only FVG trades)</li>
                        <li>Compare your decisions with AI alerts (when available)</li>
                      </ul>
                    </div>

                    <div className="bg-purple-900/20 border border-purple-700/50 p-4 rounded-lg">
                      <h4 className="font-semibold text-purple-400 mb-2">What to Practice</h4>
                      <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                        <li><strong>Entry Timing:</strong> When exactly to enter after BOS/CHoCH</li>
                        <li><strong>Pattern Recognition:</strong> Spotting FVGs, OBs, liquidity sweeps</li>
                        <li><strong>Risk Management:</strong> Where to place stops and targets</li>
                        <li><strong>Divergence Detection:</strong> Catching RSI/OBV divergences early</li>
                        <li><strong>Multi-Indicator Confluence:</strong> Finding 3+ signal alignment</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-blue-900/20 border border-blue-700/50 p-3 rounded-lg">
                    <p className="text-blue-400 text-xs font-semibold">💡 Pro Tip:</p>
                    <p className="text-gray-300 text-xs mt-1">
                      Use 10x speed to quickly scan for setups, then reset and watch at 1x-2x when you find an interesting pattern. This builds pattern recognition skills faster than studying static charts.
                    </p>
                  </div>

                  <div className="bg-orange-900/20 border border-orange-700/50 p-3 rounded-lg">
                    <p className="text-orange-400 text-xs font-semibold">🎯 Challenge Yourself:</p>
                    <p className="text-gray-300 text-xs mt-1">
                      Pause replay mode right before a major move and predict the direction. Then play forward to check if you were right. Track your accuracy over 20+ predictions to measure improvement.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ALERT SYSTEM */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-[#2a2e39] pb-3">
              <Zap className="w-6 h-6 text-yellow-500" />
              <h2 className="text-2xl font-bold">Alert System</h2>
            </div>

            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">Market Alert Types</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Our platform monitors 11 different alert types in real-time. Here's what each one means and how to use it:
                </p>
                
                <div className="space-y-3">
                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-yellow-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-yellow-400 font-semibold">💧 Liquidity Sweep</span>
                      <span className="text-xs text-gray-400 ml-auto">High Priority</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Price sweeps above/below key level then reverses. Often precedes major moves. Look for immediate entry in reversal direction.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-green-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-green-400 font-semibold">📈 BOS (Break of Structure)</span>
                      <span className="text-xs text-gray-400 ml-auto">Trend Continuation</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Trend continuation signal. Wait for pullback to OB or FVG, then enter in trend direction.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-orange-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-orange-400 font-semibold">🔄 CHoCH (Change of Character)</span>
                      <span className="text-xs text-gray-400 ml-auto">Reversal Warning</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Potential trend reversal. Don't trade immediately - wait for confirmation with second CHoCH or OB formation.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-purple-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-purple-400 font-semibold">⬜ FVG (Fair Value Gap)</span>
                      <span className="text-xs text-gray-400 ml-auto">Retracement Zone</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Price imbalance detected. Mark the zone - price often returns to fill 50-75% of gap before continuing.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-cyan-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-cyan-400 font-semibold">📊 VWAP Bounce</span>
                      <span className="text-xs text-gray-400 ml-auto">Mean Reversion</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Price touched VWAP and bounced. Enter in bounce direction with tight stop on opposite side of VWAP.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-blue-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-blue-400 font-semibold">↗️ VWAP Cross</span>
                      <span className="text-xs text-gray-400 ml-auto">Trend Change</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Price crossed VWAP. Above = bullish bias, Below = bearish bias. Use as trend filter for other setups.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-red-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-red-400 font-semibold">📉 Volume Spike</span>
                      <span className="text-xs text-gray-400 ml-auto">Institutional Activity</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Unusual volume detected (3x+ average). Something significant happening - watch for follow-through or reversal.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-indigo-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-indigo-400 font-semibold">🎯 Level 2 Absorption</span>
                      <span className="text-xs text-gray-400 ml-auto">Advanced</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Large orders absorbing one side. Bullish absorption = big buyers stepping in. Bearish = big sellers.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-pink-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-pink-400 font-semibold">📊 OBV Divergence</span>
                      <span className="text-xs text-gray-400 ml-auto">Reversal Setup</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Price and OBV moving in opposite directions. Very reliable reversal signal - wait for price confirmation.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-yellow-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-yellow-400 font-semibold">⚡ Multi-TF Oscillator Divergence</span>
                      <span className="text-xs text-gray-400 ml-auto">High Conviction</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Divergence detected across multiple timeframes. Strongest reversal signal - enter when price confirms.
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-green-500">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-green-400 font-semibold">🔔 AI Trade Alert</span>
                      <span className="text-xs text-gray-400 ml-auto">Premium</span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      Grok AI has identified a high-confluence setup. Grade A+/A = Highest quality, B/C = Moderate quality. Review signals and reasoning carefully.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white">Alert Best Practices</CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-3">
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li><strong>Multiple Confirmations:</strong> Best setups have 3+ alerts firing together (e.g., Liquidity Sweep + FVG + OBV Divergence)</li>
                  <li><strong>Timeframe Alignment:</strong> Check that higher timeframe structure supports the alert</li>
                  <li><strong>Context Matters:</strong> A VWAP bounce in a strong trend is more reliable than in choppy conditions</li>
                  <li><strong>Risk Management:</strong> Even Grade A+ alerts fail - always use proper stop losses</li>
                  <li><strong>Backtesting:</strong> Review past alerts in your chosen symbol to understand their reliability</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-[#1a1a1a] border-[#2a2e39]">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-500" />
                  Alert Filtering - Focus on Your Strategy
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-4">
                <p className="text-sm">
                  The Market Alerts panel includes a powerful filtering system to help you focus on only the indicators that matter to your trading strategy.
                </p>

                <div className="bg-slate-900 p-4 rounded-lg space-y-3">
                  <h4 className="font-semibold text-white">How It Works</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-400 font-mono">•</span>
                      <div>
                        <strong className="text-blue-400">All Mode:</strong> Shows every alert from all available indicators (default setting)
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-400 font-mono">•</span>
                      <div>
                        <strong className="text-green-400">Active Only Mode:</strong> Shows only alerts from indicators you currently have enabled or saved as default
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-900/20 border border-blue-700/50 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-blue-400">Example Use Case</h4>
                  <p className="text-sm">
                    If your strategy only uses EMA, RSI, and Bollinger Bands, switch to "Active Only" mode. Now your alerts will only show:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li>Oscillator Divergence (from RSI)</li>
                    <li>BB Upper/Lower Touch, BB Breakout, BB Middle Cross</li>
                    <li>No CVD, VWAP, OBV, or other alerts you're not using</li>
                  </ul>
                </div>

                <div className="bg-purple-900/20 border border-purple-700/50 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-purple-400">Pro Tips</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li><strong>Save Your Setup:</strong> Use "Save Defaults" button to save your preferred indicators - this also saves your alert filter preference</li>
                    <li><strong>Reduce Noise:</strong> If you're overwhelmed by too many alerts, enable only your core 3-4 indicators and use "Active Only" mode</li>
                    <li><strong>Strategy Testing:</strong> When backtesting a specific strategy, turn on only those indicators to see how alerts would have performed</li>
                    <li><strong>Quick Toggle:</strong> Switch back to "All" mode anytime to see what other signals might be appearing</li>
                  </ul>
                </div>

                <div className="bg-slate-900 p-3 rounded-lg border-l-4 border-yellow-500">
                  <p className="text-sm text-gray-100">
                    <strong className="text-yellow-400">💡 Best Practice:</strong> Focus on mastering 3-5 indicators rather than trying to track everything. Use "Active Only" mode to keep your alerts clean and focused on your playbook.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* CONCLUSION */}
          <Card className="bg-gradient-to-r from-[#00c4b4]/20 to-purple-600/20 border-[#00c4b4]/50">
            <CardContent className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Remember</h3>
              <p className="text-gray-900 text-base mb-4">
                These tools are most powerful when combined. A single indicator can give false signals, but when RSI divergence, OBV divergence, a liquidity sweep, and an FVG all align - that's a high-probability setup.
              </p>
              <p className="text-gray-900 text-base">
                <strong>Start simple:</strong> Master one concept at a time. Once comfortable with Order Blocks, add FVGs. Then add CVD. Build your edge systematically.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Bottom Navigation */}
      <CryptoNavigation />
      
      {/* Spacer for fixed navigation */}
      <div className="h-32 md:h-40"></div>
    </div>
    </>
  );
}
