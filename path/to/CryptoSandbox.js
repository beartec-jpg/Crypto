// Initialize the useAdaptiveTimeframe hook inside the CryptoSandbox component function
const { symbol, interval, data, innerWidth } = this.state;

const adaptiveTimeframe = useAdaptiveTimeframe({
    symbol,
    baseTimeframe: interval,
    visibleCandleCount: data?.length,
    chartWidth: innerWidth,
    zoomScale: 1,
    onTimeframeChange: (newTf, oldTf) => {
        setInterval(newTf);
    },
});