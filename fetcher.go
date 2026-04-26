package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
)

// --- CONFIG ---
const (
	CONCURRENCY = 100
	INTERVAL    = 3 * time.Second
	OUT_FILE    = "prices.json"
)

// --- COLORS ---
const (
	Reset  = "\033[0m"
	Green  = "\033[32m"
	Cyan   = "\033[36m"
	Blue   = "\033[34m"
	Gray   = "\033[90m"
	Red    = "\033[31m"
)

var (
	transport = &http.Transport{
		MaxIdleConns:        500,
		MaxIdleConnsPerHost: 100,
		IdleConnTimeout:     120 * time.Second,
	}
	client = &http.Client{
		Transport: transport,
		Timeout:   3 * time.Second,
	}
)

var StocksByCategory = map[string][]string{
	"Auto Ancillaries":              {"BHARATFORG", "CIEINDIA", "CRAFTSMAN", "ENDURANCE", "EXIDEIND", "FIEMIND", "GABRIEL", "JAMNAAUTO", "LUMAXIND", "RKFORGE", "SONACOMS", "SUBROS", "SUPRAJIT", "TALBROS", "UNOMINDA", "VARROC"},
	"Automobiles - OEMs":            {"ASHOKLEY", "BAJAJ-AUTO", "EICHERMOT", "FORCEMOT", "HEROMOTOCO", "M&M", "MARUTI", "OLECTRA", "TVSMOTOR"},
	"Banking":                       {"AXISBANK", "BANDHANBNK", "CSBBANK", "CUB", "DCBBANK", "DHANBANK", "ESAFSFB", "FEDERALBNK", "HDFCBANK", "ICICIBANK", "IDFCFIRSTB", "INDUSINDBK", "J&KBANK", "KARURVYSYA", "KOTAKBANK", "RBLBANK", "SOUTHBANK", "SURYODAY", "UTKARSHBNK", "YESBANK", "BANKBARODA", "BANKINDIA", "CANBK", "CENTRALBK", "IDBI", "INDIANB", "IOB", "MAHABANK", "PNB", "PSB", "SBIN", "UCOBANK", "UNIONBANK"},
	"Beverages & Distilleries":      {"ASAL", "GLOBUSSPR", "RADICO", "SULA", "TI", "UBL", "VBL"},
	"Capital Goods & Industrial":    {"ABB", "AIAENG", "BHEL", "CUMMINSIND", "DIXON", "ELGIEQUIP", "HAVELLS", "KEI", "KIRLOSENG", "LT", "POLYCAB", "SIEMENS", "SKFINDIA", "THERMAX", "TRITURBINE", "VOLTAS"},
	"Cement & Building Materials":   {"ACC", "AMBUJACEM", "DALBHARAT", "HEIDELBERG", "INDIACEM", "JKCEMENT", "ORIENTCEM", "PRSMJOHNSN", "RAMCOCEM", "SAGCEM", "SHREECEM", "STARCEMENT", "ULTRACEMCO"},
	"Chemicals":                     {"BAYERCROP", "CHAMBLFERT", "COROMANDEL", "FACT", "GNFC", "GSFC", "KAVERI", "MADRASFERT", "RCF", "SHARDACROP", "SPIC", "UPL", "AARTIIND", "ATUL", "CLEAN", "DEEPAKNTR", "FINEORG", "FLUOROCHEM", "GUJALKALI", "NAVINFLUOR", "NOCIL", "PIIND", "ROSSARI", "SRF", "SUDARSCHEM", "SUMICHEM", "TATACHEM", "VINATIORGA"},
	"Construction & Infrastructure": {"ASHOKA", "ENGINERSIN", "GPIL", "KNRCON", "NBCC", "NCC", "PATELENG", "PNCINFRA", "RKEC"},
	"Consumer D&E":                  {"AMBER", "BAJAJELEC", "BLUESTARCO", "CROMPTON", "DIXON", "KAYNES", "ORIENTELEC", "SYRMA", "WHIRLPOOL"},
	"Consumer R&S":                  {"ABFRL", "DELHIVERY", "DMART", "ETHOSLTD", "HONASA", "KALYANKJIL", "MAPMYINDIA", "NYKAA", "PAYTM", "POLICYBZR", "SENCO", "TITAN", "TRENT"},
	"Defense & Shipbuilding":        {"ASTRAZEN", "BDL", "BEL", "BEML", "COCHINSHIP", "DCXINDIA", "GRSE", "HAL", "IDEAFORGE", "MAZDOCK", "MTARTECH", "PARAS"},
	"Energy":                        {"BPCL", "CHENNPETRO", "CONFIPET", "GAIL", "GSPL", "GUJGASLTD", "GULFPETRO", "HINDPETRO", "IGL", "IOC", "MGL", "MRPL", "OIL", "ONGC", "PETRONET", "ADANIGREEN", "ADANIPOWER", "BORORENEW", "GENSOL", "GREENPANEL", "IREDA", "JPPOWER", "JSWENERGY", "NHPC", "NTPC", "POWERGRID", "SJVN", "SUZLON", "TATAPOWER", "TORNTPOWER"},
	"FMCG":                          {"AWL", "BRITANNIA", "COLPAL", "DABUR", "DODLA", "GODREJCP", "HATSUN", "HERITGFOOD", "HINDUNILVR", "ITC", "JYOTHYLAB", "MARICO", "NESTLEIND", "PGHH", "TATACONSUM", "VIJAYA"},
	"Finance":                       {"5PAISA", "AAVAS", "ANGELONE", "BAJAJFINSV", "BAJFINANCE", "CANFINHOME", "CHOLAFIN", "CREDITACC", "GEOJITFSL", "HOMEFIRST", "HUDCO", "IFCI", "IREDA", "LICHSGFIN", "M&MFIN", "MANAPPURAM", "MASFIN", "MUTHOOTFIN", "PFC", "POONAWALLA", "RECLTD", "SATIN", "SHRIRAMFIN", "UFLEX", "ABSLAMC", "BSE", "CAMS", "CDSL", "GICRE", "HDFCAMC", "HDFCLIFE", "ICICIGI", "ICICIPRULI", "IEX", "KFINTECH", "MCX", "NAM-INDIA", "NIACL", "SBILIFE", "UTIAMC"},
	"Healthcare & Diagnostics":      {"APOLLOHOSP", "ASTERDM", "FORTIS", "GLOBAL", "KIMS", "LALPATHLAB", "MAXHEALTH", "MEDANTA", "METROPOLIS", "RAINBOW", "SHALBY", "THYROCARE", "VIJAYA"},
	"Hospitality & Tourism":         {"CHALET", "EASEMYTRIP", "EIHOTEL", "INDHOTEL", "ITDC", "LEMONTREE", "SPECIALITY", "TAJGVK"},
	"IT - SmallCap & Specialized":   {"63MOONS", "DATARELI", "DSSL", "HAPPSTMNDS", "INTELLECT", "KELLTONTEC", "NELCO", "NETWEB", "NEWGEN", "RAMCOSYS", "ROUTE", "SAKSOFT", "TANLA", "VALIANTORG"},
	"IT - Tier 1 & 2":               {"BSOFT", "COFORGE", "CYIENT", "HCLTECH", "INFY", "KPITTECH", "LTIM", "LTTS", "MASTEK", "MPHASIS", "OFSS", "PERSISTENT", "SONATSOFTW", "TATAELXSI", "TCS", "TECHM", "WIPRO", "ZENSARTECH"},
	"Metals":                        {"APLAPOLLO", "ELECTCAST", "JINDALSTEL", "JSL", "JSWSTEEL", "RATNAMANI", "SAIL", "SUNFLAG", "TATASTEEL", "WELCORP", "COALINDIA", "GMDC", "HINDALCO", "HINDCOPPER", "HINDZINC", "KIOCL", "MIDHANI", "MOIL", "NATIONALUM", "NMDC", "VEDL"},
	"Pharmaceuticals":               {"ABBOTINDIA", "ALKEM", "AUROPHARMA", "BIOCON", "CIPLA", "DIVISLAB", "DRREDDY", "ERIS", "GLAND", "GLAXO", "GRANULES", "IPCALAB", "JBCHEPHARM", "LAURUSLABS", "LUPIN", "MANKIND", "MARKSANS", "NATCOPHARM", "SUNPHARMA", "TORNTPHARM", "ZYDUSLIFE"},
	"Railways & Logistics":          {"ALLCARGO", "BLUEDART", "CONCOR", "DELHIVERY", "GATEWAY", "IRB", "IRCON", "IRFC", "JWL", "KEC", "RAILTEL", "RITES", "RVNL", "TCI", "TEXRAIL", "TITAGARH"},
	"Real Estate":                   {"AJMERA", "BRIGADE", "DLF", "GODREJPROP", "IBREALEST", "LODHA", "MAHLIFE", "OBEROIRLTY", "PHOENIXLTD", "PRESTIGE", "PURVA", "SOBHA", "SUNTECK"},
	"Sugar & Agriculture":           {"AVADHSUGAR", "BALRAMCHIN", "BANARISUG", "DALMIASUG", "DHAMPURSUG", "EIDPARRY", "RENUKA", "TRIVENI"},
	"Telecom & Media":               {"BHARTIARTL", "GTLINFRA", "HFCL", "IDEA", "INDUSTOWER", "ITI", "NETWORK18", "PVRINOX", "SAREGAMA", "SUNTV", "TIPSMUSIC", "ZEEL"},
	"Textiles & Apparels":           {"ARVIND", "FILATEX", "GOKEX", "KPRMILL", "LUXIND", "NITINSPIN", "PAGEIND", "RAYMOND", "RUPA", "SANGAMIND", "TRIDENT"},
	"Tyres & Rubber":                {"APOLLOTYRE", "CEATLTD", "GOODYEAR", "JKTYRE", "MRF", "TVSSRICHAK"},
}

type PriceResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Price float64 `json:"regularMarketPrice"`
			} `json:"meta"`
		} `json:"result"`
	} `json:"chart"`
}

type FinalOutput struct {
	LastUpdated string                            `json:"last_updated"`
	Stocks      map[string]map[string]interface{} `json:"stocks"`
}

type Job struct {
	Category string
	Symbol   string
}

func renderProgressBar(iteration int, total int) {
	width := 30
	percent := float64(iteration) / float64(total)
	filledLength := int(float64(width) * percent)

	bar := ""
	for i := 0; i < filledLength; i++ {
		bar += "█"
	}
	for i := 0; i < width-filledLength; i++ {
		bar += "░"
	}

	fmt.Printf("\r%sNext fetch in: [%s] %d%%%s", Gray, bar, int(percent*100), Reset)
}

func main() {
	var jobs []Job
	for cat, syms := range StocksByCategory {
		for _, sym := range syms {
			jobs = append(jobs, Job{cat, sym})
		}
	}

	fetchCount := 0
	fmt.Print("\033[H\033[2J") // Initial clear

	for {
		fmt.Print("\033[H") // Reset cursor to top
		fmt.Printf("%sNSE Stock Prices Fetcher Successfully Active%s\n", Blue, Reset)
		fmt.Printf("Fetching: %s%d Stocks%s\n\n", Green, len(jobs), Reset)

		start := time.Now()
		var wg sync.WaitGroup
		sem := make(chan struct{}, CONCURRENCY)
		mu := sync.Mutex{}

		data := make(map[string]map[string]interface{})
		for cat := range StocksByCategory {
			data[cat] = make(map[string]interface{})
		}

		for _, j := range jobs {
			wg.Add(1)
			go func(job Job) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s.NS", job.Symbol)
				req, _ := http.NewRequest("GET", url, nil)
				req.Header.Set("User-Agent", "Mozilla/5.0")
				
				resp, err := client.Do(req)
				if err != nil { return }
				defer resp.Body.Close()

				var pr PriceResponse
				if err := json.NewDecoder(resp.Body).Decode(&pr); err == nil && len(pr.Chart.Result) > 0 {
					price := pr.Chart.Result[0].Meta.Price
					mu.Lock()
					data[job.Category][job.Symbol] = price
					mu.Unlock()
				}
			}(j)
		}

		wg.Wait()
		fetchCount++

		output := FinalOutput{
			LastUpdated: time.Now().Format(time.RFC3339),
			Stocks:      data,
		}
		prettyJSON, _ := json.MarshalIndent(output, "", "  ")
		_ = os.WriteFile(OUT_FILE, prettyJSON, 0644)

		fmt.Printf("%s[%d]%s Prices updated in: %s%v%s\n", Gray, fetchCount, Reset, Cyan, time.Since(start), Reset)

		// --- COOL-DOWN WITH PROGRESS BAR ---
		steps := 30
		stepDuration := INTERVAL / time.Duration(steps)
		for i := 0; i <= steps; i++ {
			renderProgressBar(i, steps)
			time.Sleep(stepDuration)
		}
		// Clear the progress bar line before restarting
		fmt.Print("\033[2K\r") 
	}
}
