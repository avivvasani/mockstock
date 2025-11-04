import json, os, time, warnings, signal, sys
from datetime import datetime, timezone
import yfinance as yf
import pandas as pd

# --- Suppress warnings and logs ---
warnings.filterwarnings("ignore", category=FutureWarning)
pd.options.mode.chained_assignment = None

OUTPUT_FILE = "prices.json"
FETCH_INTERVAL = 3  # seconds between cycles
THREADS = True
RUNNING = True

# --- Exit handler ---
def handle_exit(signum, frame):
    global RUNNING
    RUNNING = False
    print(" [Stopped]")
    sys.exit(0)

signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)

# --- Stock tickers ---
STOCKS_BY_CATEGORY = {
    "Finance": [
        "HDFCBANK", "ICICIBANK", "SBIN", "BAJFINANCE", "KOTAKBANK", "AXISBANK",
        "INDUSINDBK", "HDFCLIFE", "SBILIFE", "ICICIPRULI", "CHOLAFIN", "BAJAJFINSV",
        "SHRIRAMFIN", "AUBANK", "FEDERALBNK", "IDFCFIRSTB", "PFC", "RECLTD",
        "LICHSGFIN", "MUTHOOTFIN", "CANBK", "BANKBARODA", "AAVAS", "5PAISA",
        "PAYTM", "JIOFIN", "M&MFIN"
    ],
    "Information Technology": [
        "TCS", "INFY", "WIPRO", "HCLTECH", "TECHM", "LTIM", "COFORGE",
        "MPHASIS", "PERSISTENT", "TATAELXSI", "KPITTECH", "CYIENT", "SONATSOFTW",
        "MASTEK", "ZENSARTECH", "LTTS", "NAUKRI",
        "POLYCAB", "DIXON"
    ],
    "Pharmaceuticals & Healthcare": [
        "SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "LUPIN", "TORNTPHARM",
        "ZYDUSLIFE", "AUROPHARMA", "IPCALAB", "BIOCON", "ALKEM", "GLAXO",
        "APOLLOHOSP", "FORTIS", "MAXHEALTH", "LAURUSLABS", "GRANULES", "DRL",
        "NATCOPHARM"
    ],
    "Automobiles & Auto Ancillaries": [
        "MARUTI", "M&M", "EICHERMOT", "HEROMOTOCO", "TVSMOTOR",
        "ASHOKLEY", "BAJAJ-AUTO", "BOSCHLTD", "MRF", "ESCORTS", "BALKRISIND",
        "SONACOMS", "SUPRAJIT", "BHARATFORG"
    ],
    "Energy & Utilities (Oil, Gas, Power)": [
        "RELIANCE", "ONGC", "NTPC", "POWERGRID", "BPCL", "IOC", "GAIL",
        "TATAPOWER", "ADANIGREEN", "NHPC", "OIL", "JSWENERGY", "COALINDIA",
        "ADANIPOWER", "TORNTPOWER", "IGL", "MGL", "PETRONET", "HINDZINC"
    ],
    "FMCG (Fast Moving Consumer Goods)": [
        "HINDUNILVR", "NESTLEIND", "ITC", "BRITANNIA", "DABUR", "MARICO",
        "COLPAL", "GODREJCP", "EMAMILTD", "VBL", "PGHH", "GILLETTE",
        "TATACONSUM", "UBL", "RADICO", "JUBLFOOD", "AWL", "RELAXO"
    ],
    "Metals & Mining": [
        "TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL", "SAIL", "NMDC",
        "JINDALSTEL", "COALINDIA", "MOIL"
    ],
    "Construction & Infrastructure": [
        "LT", "ULTRACEMCO", "ASIANPAINT", "PIDILITIND", "GRASIM", "SHREECEM",
        "ACC", "AMBUJACEM", "DALBHARAT", "RAMCOCEM", "ADANIENT", "JSWINFRA",
        "ADANIPORTS", "NCC", "IRB", "NBCC"
    ],
    "Telecommunications": [
        "BHARTIARTL", "IDEA", "JIOFIN", "INDUSINDBK", "TATACOMM", "VTL"
    ],
    "Real Estate": [
        "DLF", "GODREJPROP", "OBEROIRLTY", "PRESTIGE", "BRIGADE", "SOBHA",
        "PHOENIXLTD", "MAHLIFE"
    ],
    "Chemicals & Fertilizers": [
        "TATACHEM", "UPL", "PIIND", "DEEPAKFERT", "GNFC", "COROMANDEL",
        "ATUL", "SUMICHEM", "AARTIIND", "ALKEM", "NAVINFLUOR", "SOLARINDS"
    ],
    "Aviation & Logistics": [
        "INDIGO", "TCI", "CONCOR", "ALLCARGO", "BLUEDART",
        "MAHLOG", "SCI"
    ],
    "Capital Goods & Engineering": [
        "BHEL", "SIEMENS", "CUMMINSIND", "ABB", "GRASIM", "SKFINDIA",
        "HAL", "BEL", "PETRONET", "THERMAX", "KEI"
    ],
    "Consumer Durables & Footwear": [
        "TITAN", "VOLTAS", "CROMPTON", "HAVELLS", "DIXON", "BATAINDIA",
        "RELAXO", "VIPIND", "WHIRLPOOL"
    ],
    "Media & Entertainment": [
        "ZEEL", "SUNTV", "PVRINOX", "NETWORK18", "HTMEDIA"
    ],
    "Hospitality & Leisure": [
        "INDHOTEL", "CHALET", "EASEMYTRIP", "THOMASCOOK", "EIHOTEL",
        "LEMONTREE"
    ],
    "Public Sector Undertakings (PSU)": [
        "SBIN", "NTPC", "ONGC", "GAIL", "BPCL", "IOC", "COALINDIA",
        "PFC", "RECLTD", "SAIL", "HAL", "BEL", "BHEL", "NHPC", "PNB"
    ],
    "Diversified Conglomerates": [
        "RELIANCE", "ADANIENT", "ITC", "LT", "GRASIM"
    ]
}
ALL_TICKERS = [f"{t}.NS" for cats in STOCKS_BY_CATEGORY.values() for t in cats]

def atomic_write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)

def fetch_prices():
    df = yf.download(
        tickers=ALL_TICKERS,
        period="1d",
        interval="1m",
        group_by="ticker",
        threads=THREADS,
        progress=False,
        auto_adjust=True
    )
    prices = {}
    if isinstance(df.columns, pd.MultiIndex):
        for t in ALL_TICKERS:
            short = t[:-3]
            try:
                close = df[(t, "Close")].dropna()
                prices[short] = float(close.iloc[-1]) if not close.empty else None
            except Exception:
                prices[short] = None
    return prices

def run_cycle():
    snapshot = {"last_updated": datetime.now(timezone.utc).isoformat(), "stocks": {}}
    for cat in STOCKS_BY_CATEGORY:
        snapshot["stocks"][cat] = {}
    prices = fetch_prices()
    for cat, tickers in STOCKS_BY_CATEGORY.items():
        for t in tickers:
            snapshot["stocks"][cat][t] = prices.get(t, None)
    atomic_write(OUTPUT_FILE, snapshot)
    return snapshot

if __name__ == "__main__":
    print("[yfinance-streamer] Running — Ctrl+C to stop")
    while RUNNING:
        start = time.time()
        data = run_cycle()
        elapsed = time.time() - start
        print(f"Updated {OUTPUT_FILE} at {data['last_updated']} (took {elapsed:.2f}s)")
        time.sleep(max(0, FETCH_INTERVAL - elapsed))
