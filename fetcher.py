import json, os, time, warnings, signal, sys
from datetime import datetime, timezone
import yfinance as yf
import requests

warnings.filterwarnings("ignore")

OUTPUT_FILE = "prices.json"
FETCH_INTERVAL = 3
RUNNING = True

session = requests.Session()

def handle_exit(sig, frame):
    global RUNNING
    RUNNING = False
    print("Stopped")
    sys.exit(0)

signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)


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
        "APOLLOHOSP", "FORTIS", "MAXHEALTH", "LAURUSLABS", "GRANULES", 
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

ALL_TICKERS = [f"{t}.NS" for v in STOCKS_BY_CATEGORY.values() for t in v]
ticker_str = " ".join(ALL_TICKERS)


def atomic_write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(tmp, path)


def fetch_prices():
    tickers = yf.Tickers(ticker_str, session=session)

    prices = {}
    for symbol, obj in tickers.tickers.items():
        short = symbol[:-3]
        try:
            info = obj.fast_info
            prices[short] = float(info["lastPrice"])
        except Exception:
            prices[short] = None

    return prices


def run_cycle(prev_hash=[None]):
    prices = fetch_prices()

    snapshot = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "stocks": {}
    }

    for cat, tickers in STOCKS_BY_CATEGORY.items():
        snapshot["stocks"][cat] = {t: prices.get(t) for t in tickers}

    raw = json.dumps(snapshot, separators=(",", ":"))

    if raw != prev_hash[0]:  # only write if changed
        atomic_write(OUTPUT_FILE, snapshot)
        prev_hash[0] = raw

    return snapshot


if __name__ == "__main__":
    print("Fast price streamer running")

    while RUNNING:
        start = time.time()

        try:
            data = run_cycle()
            print("Updated:", data["last_updated"])
        except Exception as e:
            print("Fetch error:", e)

        elapsed = time.time() - start
        time.sleep(max(0, FETCH_INTERVAL - elapsed))
