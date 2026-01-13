# Trade Signal Bot 🚀

A Node.js trading bot that monitors cryptocurrency markets and sends buy/sell signals to Telegram based on technical analysis.

## Features
- 📊 **Real-time Data**: Fetches live price data using `ccxt` (supports Binance, Kraken, Coinbase, etc.).
- 📈 **Technical Analysis**: Calculates indicators like RSI, MACD, and SMA.
- 🔔 **Telegram Alerts**: Sends instant notifications when a signal is triggered.
- ⚙️ **Configurable**: Easily adjust timeframes, pairs, and strategy parameters.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Configuration**:
    Create a `.env` file in the root directory:
    ```env
    TELEGRAM_BOT_TOKEN=your_telegram_bot_token
    TELEGRAM_CHAT_ID=your_chat_id
    EXCHANGE=binance
    PAIRS=BTC/USDT,ETH/USDT
    TIMEFRAME=15m
    ```

3.  **Run the Bot**:
    ```bash
    npm start
    ```

## Strategy
Currently uses **RSI (Relative Strength Index)**:
- **Buy Signal**: RSI < 30 (Oversold)
- **Sell Signal**: RSI > 70 (Overbought)
