package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
	"math"

	_ "modernc.org/sqlite" // Pure Go driver (Zero C compiler/GCC required)
)

// --- Configuration Constants ---
const (
	Port            = 16000
	StartingCapital = 100000.0
)

var (
	baseDir, _   = os.Getwd()
	jsonFile     = filepath.Join(baseDir, "prices.json")
	databaseFile = filepath.Join(baseDir, "database.db") // Combined unified database
	listFile     = filepath.Join(baseDir, "list.json")   // Combined passwords and school config
)

var servedWebpages = []string{"index.html", "manual.html", "leaderboard.html"}

// --- Consolidated Configuration Structures ---
type UserProfile struct {
	Password string `json:"password"`
	School   string `json:"school"`
}

type ListConfig struct {
	Users       map[string]UserProfile `json:"users"`
	SchoolLogos map[string]string      `json:"school_logos"`
}

var (
	configData ListConfig
	usersLock  sync.RWMutex
)

// Global Single SQLite connection pool and a Write Mutex to prevent database locks
var (
	db      *sql.DB
	dbMutex sync.Mutex // CRITICAL: Ensures concurrent requests never lock the database file
)

// --- Core Data Structures ---
type Portfolio struct {
	Username          string             `json:"username"`
	StartingCash      float64            `json:"starting_cash"` // Kept aligned with structural maps
	RemainingCash     float64            `json:"remaining_cash"`
	CurrentStockValue float64            `json:"current_stock_holding_value"`
	RealizedPL        float64            `json:"realized_p_l"`
	UnrealizedPL      float64            `json:"unrealized_p_l"`
	TotalNetWorth     float64            `json:"total_net_worth"`
	OverallPL         float64            `json:"overall_total_p_l"`
	TotalTransactions int                `json:"total_transactions"`
	TotalUnsoldShares int                `json:"total_unsold_shares"`
	ActiveHoldings    map[string]Holding `json:"active_holdings"`
}

type Holding struct {
	Quantity        int     `json:"quantity"`
	AverageBuyPrice float64 `json:"average_buy_price"`
	CurrentPrice    float64 `json:"current_market_price"`
	TotalCost       float64 `json:"total_cost_basis"`
	CurrentValue    float64 `json:"current_market_value"`
}

type PriceData struct {
	Stocks map[string]map[string]float64 `json:"stocks"`
}

type SyncTplPayload struct {
	Username string  `json:"username"`
	TotalPL  float64 `json:"total_pl"`
}

var (
	userHistoryData  = make(map[string][]map[string]interface{})
	maxHistoryPoints = 600
	historyLock      sync.RWMutex
)

// --- Security Helper ---
func sanitizeTableName(name string) string {
	reg := regexp.MustCompile(`[^a-zA-Z0-9 ]+`)
	return reg.ReplaceAllString(name, "")
}

// --- Truncation Utility Helper ---
// Simply drops any value after two decimal places without rounding up.
// This permanently zero-out scientific notation drifting loops (e.g. 1.455e-11 -> 0.0)
func truncateToTwoDecimals(val float64) float64 {
	return math.Trunc(val*100) / 100
}

// --- Initialization Functions ---

func initConfigList() {
	usersLock.Lock()
	defer usersLock.Unlock()

	if _, err := os.Stat(listFile); os.IsNotExist(err) {
		blankConfig := ListConfig{
			Users:       make(map[string]UserProfile),
			SchoolLogos: make(map[string]string),
		}
		data, _ := json.MarshalIndent(blankConfig, "", "  ")
		_ = os.WriteFile(listFile, data, 0644)
	}

	fileData, err := os.ReadFile(listFile)
	if err != nil {
		log.Fatalf("Failed to read list.json: %v", err)
	}
	
	if err := json.Unmarshal(fileData, &configData); err != nil {
		log.Fatalf("Failed to parse list.json structure: %v", err)
	}
}

func initDatabase() {
	var err error
	db, err = sql.Open("sqlite", databaseFile)
	if err != nil {
		log.Fatalf("Failed to open unified database: %v", err)
	}

	db.SetMaxOpenConns(1)
	_, _ = db.Exec("PRAGMA journal_mode=WAL;")
	_, _ = db.Exec("PRAGMA busy_timeout=10000;") 

	dbMutex.Lock()
	defer dbMutex.Unlock()

	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS Analytics (
		username TEXT PRIMARY KEY,
		total_pl REAL,
		total_transactions INTEGER,
		total_unsold_shares INTEGER,
		cash_balance REAL,
		stock_value REAL,
		realized_pl REAL,
		unrealized_pl REAL,
		total_net_worth REAL,
		remaining_stocks TEXT
	);`)
	if err != nil {
		log.Fatalf("Failed analytics schema setup: %v", err)
	}
}

func createUserTable(username string) {
	safeName := sanitizeTableName(username)
	query := fmt.Sprintf(`
	CREATE TABLE IF NOT EXISTS "%s" (
		time TEXT,
		type TEXT,
		stock TEXT,
		quantity INTEGER,
		price_ps REAL,
		price_tt REAL
	);`, safeName)
	_, _ = db.Exec(query)
}

// --- Pipeline Processing Logic ---

func loadMarketPrices(filePath string) (map[string]float64, error) {
	file, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	var data PriceData
	if err := json.Unmarshal(file, &data); err != nil {
		return nil, err
	}
	flattenedPrices := make(map[string]float64)
	for _, industryStocks := range data.Stocks {
		for ticker, price := range industryStocks {
			flattenedPrices[ticker] = price
		}
	}
	return flattenedPrices, nil
}

func getAllTrackedTraders() ([]string, error) {
	rows, err := db.Query("SELECT username FROM Analytics;")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var traders []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			traders = append(traders, name)
		}
	}
	return traders, nil
}

func computeUserPortfolio(username string, prices map[string]float64) (Portfolio, error) {
	createUserTable(username)

	safeName := sanitizeTableName(username)
	query := fmt.Sprintf(`SELECT type, stock, quantity, price_ps, price_tt FROM "%s"`, safeName)
	rows, err := db.Query(query)
	if err != nil {
		return Portfolio{}, err
	}
	defer rows.Close()

	cash := StartingCapital
	realizedPL := 0.0
	txCount := 0

	type trackingHolding struct {
		qty       int
		totalCost float64
	}
	holdingsMap := make(map[string]*trackingHolding)

	for rows.Next() {
		var action, stock string
		var qty int
		var pricePS, priceTT float64
		if err := rows.Scan(&action, &stock, &qty, &pricePS, &priceTT); err != nil {
			continue
		}
		txCount++

		if priceTT <= 0 && qty > 0 && pricePS > 0 {
			priceTT = pricePS * float64(qty)
		}

		if _, exists := holdingsMap[stock]; !exists {
			holdingsMap[stock] = &trackingHolding{}
		}

		if action == "BUY" || action == "buy" {
			cash -= priceTT
			holdingsMap[stock].qty += qty
			holdingsMap[stock].totalCost += priceTT
		} else if action == "SELL" || action == "sell" {
			cash += priceTT
			th := holdingsMap[stock]
			if th.qty > 0 {
				avgCost := th.totalCost / float64(th.qty)
				costOfSoldShares := avgCost * float64(qty)
				realizedPL += (priceTT - costOfSoldShares)

				th.qty -= qty
				th.totalCost -= costOfSoldShares
			}
		}
	}

	currentStockHoldingValue := 0.0
	unrealizedPL := 0.0
	unsoldSharesCount := 0
	activeHoldings := make(map[string]Holding)

	for ticker, track := range holdingsMap {
		// FIX: Ensures complete clean-up inside calculation logic
		if track.qty <= 0 {
			continue
		}
		currentMarketPrice := prices[ticker]
		marketVal := float64(track.qty) * currentMarketPrice
		unrealizedStockPL := marketVal - track.totalCost

		currentStockHoldingValue += marketVal
		unrealizedPL += unrealizedStockPL
		unsoldSharesCount += track.qty

		activeHoldings[ticker] = Holding{
			Quantity:        track.qty,
			AverageBuyPrice: truncateToTwoDecimals(track.totalCost / float64(track.qty)),
			CurrentPrice:    currentMarketPrice,
			TotalCost:       truncateToTwoDecimals(track.totalCost),
			CurrentValue:    truncateToTwoDecimals(marketVal),
		}
	}

	totalNetWorth := cash + currentStockHoldingValue
	overallPL := totalNetWorth - StartingCapital

	return Portfolio{
		Username:          username,
		StartingCash:      StartingCapital,
		RemainingCash:     truncateToTwoDecimals(cash),
		CurrentStockValue: truncateToTwoDecimals(currentStockHoldingValue),
		RealizedPL:        truncateToTwoDecimals(realizedPL),
		UnrealizedPL:      truncateToTwoDecimals(unrealizedPL),
		TotalNetWorth:     truncateToTwoDecimals(totalNetWorth),
		OverallPL:         truncateToTwoDecimals(overallPL),
		TotalTransactions: txCount,
		TotalUnsoldShares: unsoldSharesCount,
		ActiveHoldings:    activeHoldings,
	}, nil
}

func runAnalyticsPipelineForUser(username string) {
	livePrices, err := loadMarketPrices(jsonFile)
	if err != nil {
		log.Printf("Skipping pipeline execution: %v", err)
		return
	}

	portfolio, err := computeUserPortfolio(username, livePrices)
	if err != nil {
		log.Printf("Failed portfolio computing step for %s: %v", username, err)
		return
	}

	saveSingleUserToSQLite(portfolio)
}

func saveSingleUserToSQLite(r Portfolio) {
	dbMutex.Lock()
	defer dbMutex.Unlock()

	stmt, err := db.Prepare(`INSERT OR REPLACE INTO Analytics (
		username, total_pl, total_transactions, total_unsold_shares, 
		cash_balance, stock_value, realized_pl, unrealized_pl, total_net_worth, remaining_stocks
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		log.Printf("Failed to prepare statement: %v", err)
		return
	}
	defer stmt.Close()

	var remainingStocksStr string
	if len(r.ActiveHoldings) == 0 {
		remainingStocksStr = "{}"
	} else {
		holdingsJSON, err := json.Marshal(r.ActiveHoldings)
		if err != nil {
			remainingStocksStr = "{}"
		} else {
			remainingStocksStr = string(holdingsJSON)
		}
	}

	// FIX: Explicitly writing pre-truncated safe elements to columns
	_, err = stmt.Exec(
		r.Username,
		truncateToTwoDecimals(r.OverallPL),
		r.TotalTransactions,
		r.TotalUnsoldShares,
		truncateToTwoDecimals(r.RemainingCash),
		truncateToTwoDecimals(r.CurrentStockValue),
		truncateToTwoDecimals(r.RealizedPL),
		truncateToTwoDecimals(r.UnrealizedPL),
		truncateToTwoDecimals(r.TotalNetWorth),
		remainingStocksStr,
	)
	if err != nil {
		log.Printf("Error running single user upsert execution: %v", err)
	}
}

// --- Background Loop ---

func getStockPrices() map[string]interface{} {
	file, err := os.ReadFile(jsonFile)
	if err != nil {
		return map[string]interface{}{"stocks": map[string]interface{}{}}
	}
	var data map[string]interface{}
	_ = json.Unmarshal(file, &data)
	return data
}

func updateUserPLHistoryLoop() {
	for {
		time.Sleep(3 * time.Second)
		priceDataRaw := getStockPrices()
		stocksMap, ok := priceDataRaw["stocks"].(map[string]interface{})
		if !ok {
			continue
		}

		livePrices := make(map[string]float64)
		for _, catData := range stocksMap {
			category, ok := catData.(map[string]interface{})
			if !ok {
				continue
			}
			for ticker, priceVal := range category {
				if p, ok := priceVal.(float64); ok {
					livePrices[ticker] = p
				}
			}
		}

		dbMutex.Lock()
		traders, err := getAllTrackedTraders()
		if err != nil {
			dbMutex.Unlock()
			continue
		}

		timestamp := time.Now().Format("15:04:05")

		for _, username := range traders {
			createUserTable(username)
			safeName := sanitizeTableName(username)
			query := fmt.Sprintf(`SELECT type, stock, quantity, price_ps, price_tt FROM "%s"`, safeName)
			txRows, err := db.Query(query)
			if err != nil {
				continue
			}

			cash := StartingCapital
			holdingsQty := make(map[string]int)

			for txRows.Next() {
				var action, stock string
				var qty int
				var pricePS, priceTT float64
				
				if txRows.Scan(&action, &stock, &qty, &pricePS, &priceTT) == nil {
					if priceTT <= 0 && qty > 0 && pricePS > 0 {
						priceTT = pricePS * float64(qty)
					}

					if action == "BUY" || action == "buy" {
						cash -= priceTT
						holdingsQty[stock] += qty
					} else if action == "SELL" || action == "sell" {
						cash += priceTT
						holdingsQty[stock] -= qty
					}
				}
			}
			txRows.Close()

			stockValue := 0.0
			for ticker, qty := range holdingsQty {
				if qty > 0 {
					stockValue += float64(qty) * livePrices[ticker]
				}
			}

			totalNetWorth := cash + stockValue
			overallProfitOrLoss := totalNetWorth - StartingCapital

			// FIX: Truncates user history snapshot points cleanly before append arrays
			point := map[string]interface{}{
				"time":  timestamp, 
				"price": truncateToTwoDecimals(overallProfitOrLoss),
			}

			historyLock.Lock()
			userHistoryData[username] = append(userHistoryData[username], point)
			if len(userHistoryData[username]) > maxHistoryPoints {
				userHistoryData[username] = userHistoryData[username][1:]
			}
			historyLock.Unlock()
		}
		dbMutex.Unlock()
	}
}

// --- HTTP Request Handlers ---

func login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	_ = json.NewDecoder(r.Body).Decode(&creds)

	usersLock.RLock()
	profile, exists := configData.Users[creds.Username]
	usersLock.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	if exists && profile.Password == creds.Password {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Login successful",
			"school":  profile.School, 
		})
	} else {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Invalid credentials",
		})
	}
}

func apiPrices(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(getStockPrices())
}

func apiPricesStream(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	var lastModTime time.Time

	for {
		select {
		case <-r.Context().Done():
			return
		default:
			info, err := os.Stat(jsonFile)
			if err == nil {
				modTime := info.ModTime()
				if modTime.After(lastModTime) {
					lastModTime = modTime
					file, err := os.ReadFile(jsonFile)
					if err == nil {
						fmt.Fprintf(w, "data: %s\n\n", string(file))
						flusher.Flush() 
					}
				}
			}
			time.Sleep(1 * time.Second)
		}
	}
}

func apiGetTransactions(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, "Missing username", http.StatusBadRequest)
		return
	}

	dbMutex.Lock()
	defer dbMutex.Unlock()

	createUserTable(username)
	safeName := sanitizeTableName(username)
	query := fmt.Sprintf(`SELECT time, type, stock, quantity, price_ps, price_tt FROM "%s" ORDER BY rowid ASC`, safeName)
	rows, err := db.Query(query)
	if err != nil {
		http.Error(w, "Error fetching transactions", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var txs []map[string]interface{}
	for rows.Next() {
		var txTime, action, stock string
		var quantity int
		var pricePS, priceTT float64
		_ = rows.Scan(&txTime, &action, &stock, &quantity, &pricePS, &priceTT)
		txs = append(txs, map[string]interface{}{
			"time": txTime, "action": action, "stock": stock, "quantity": quantity,
			"price_per_stock": truncateToTwoDecimals(pricePS), "total_price": truncateToTwoDecimals(priceTT),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(txs)
}

func apiUserHistoryMetrics(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, "Missing username parameter", http.StatusBadRequest)
		return
	}

	dbMutex.Lock()
	defer dbMutex.Unlock()

	query := `SELECT total_pl, total_transactions, total_unsold_shares, cash_balance, stock_value, realized_pl, unrealized_pl, total_net_worth, remaining_stocks FROM Analytics WHERE username = ?`
	var totalTransactions, totalUnsoldShares int
	var totalPL, cashBalance, stockValue, realizedPL, unrealizedPL, totalNetWorth float64
	var remainingStocks string

	err := db.QueryRow(query, username).Scan(&totalPL, &totalTransactions, &totalUnsoldShares, &cashBalance, &stockValue, &realizedPL, &unrealizedPL, &totalNetWorth, &remainingStocks)
	if err == sql.ErrNoRows {
		http.Error(w, "No performance analytics found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// FIX: Output clean structural floats to API view response layouts
	metricsMap := map[string]interface{}{
		"rank":                        0, 
		"overall_total_p_l":           truncateToTwoDecimals(totalPL),
		"total_transactions":          totalTransactions,
		"total_unsold_shares":         totalUnsoldShares,
		"remaining_cash":              truncateToTwoDecimals(cashBalance),
		"current_stock_holding_value": truncateToTwoDecimals(stockValue),
		"realized_p_l":                truncateToTwoDecimals(realizedPL),
		"unrealized_p_l":              truncateToTwoDecimals(unrealizedPL),
		"total_net_worth":             truncateToTwoDecimals(totalNetWorth),
	}

	var activeHoldings map[string]Holding
	if remainingStocks != "-" && remainingStocks != "" && remainingStocks != "{}" {
		_ = json.Unmarshal([]byte(remainingStocks), &activeHoldings)
		metricsMap["active_holdings"] = activeHoldings
	} else {
		metricsMap["active_holdings"] = make(map[string]Holding)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metricsMap)
}

func syncTplHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload SyncTplPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	dbMutex.Lock()
	createUserTable(payload.Username)
	dbMutex.Unlock()
	
	runAnalyticsPipelineForUser(payload.Username)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Total P/L synchronized successfully"})
}

func recordTransaction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var tx struct {
		User          string  `json:"user"`
		Action        string  `json:"action"`
		Stock         string  `json:"stock"`
		Quantity      int     `json:"quantity"`
		PricePerStock float64 `json:"price_per_stock"`
		TotalPrice    float64 `json:"total_price"`
		Timestamp     string  `json:"timestamp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	if tx.TotalPrice <= 0 && tx.Quantity > 0 && tx.PricePerStock > 0 {
		tx.TotalPrice = tx.PricePerStock * float64(tx.Quantity)
	}

	dbMutex.Lock()
	createUserTable(tx.User)
	safeName := sanitizeTableName(tx.User)

	insertUserSQL := fmt.Sprintf(`INSERT INTO "%s" (time, type, stock, quantity, price_ps, price_tt) VALUES (?, ?, ?, ?, ?, ?);`, safeName)
	_, err := db.Exec(insertUserSQL, tx.Timestamp, tx.Action, tx.Stock, tx.Quantity, tx.PricePerStock, tx.TotalPrice)
	if err != nil {
		dbMutex.Unlock()
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	dbMutex.Unlock()

	runAnalyticsPipelineForUser(tx.User)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})

	fmt.Printf("\033[32m[SUCCESS]\033[0m User: \033[33m%s\033[0m | Action: \033[36m%s\033[0m | \033[35m%d\033[0m SHARE(S) OF \033[33m%s\033[0m @ \033[32m%.2f\033[0m | TOTAL: \033[32m%.2f\033[0m\n",
		tx.User, tx.Action, tx.Quantity, tx.Stock, tx.PricePerStock, tx.TotalPrice)
}

func apiLeaderboard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	dbMutex.Lock()
	defer dbMutex.Unlock()

	query := `SELECT username, total_pl FROM Analytics`
	rows, err := db.Query(query)
	if err != nil {
		http.Error(w, "Error fetching leaderboard data", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type LeaderboardEntry struct {
		Username string  `json:"username"`
		TotalPL  float64 `json:"total_pl"`
	}

	var leaderboard []LeaderboardEntry
	for rows.Next() {
		var entry LeaderboardEntry
		if err := rows.Scan(&entry.Username, &entry.TotalPL); err == nil {
			// FIX: Leaderboards truncate clean fractions to drop drift exponents
			entry.TotalPL = truncateToTwoDecimals(entry.TotalPL)
			leaderboard = append(leaderboard, entry)
		}
	}

	json.NewEncoder(w).Encode(leaderboard)
}

// --- Server Lifecycle ---

func main() {
	initDatabase()
	defer db.Close()
	initConfigList()

	usersLock.RLock()
	var traders []string
	for name := range configData.Users {
		traders = append(traders, name)
	}
	usersLock.RUnlock()

	for _, username := range traders {
		runAnalyticsPipelineForUser(username)
	}

	go updateUserPLHistoryLoop()

	// --------------------------------------------------
	// EXISTING PORT 16000 SERVER SETUP
	// --------------------------------------------------
	mux16000 := http.NewServeMux()
	mux16000.HandleFunc("/api/login", login)
	mux16000.HandleFunc("/api/prices", apiPrices)
	mux16000.HandleFunc("/api/prices/stream", apiPricesStream)
	mux16000.HandleFunc("/api/history", apiUserHistoryMetrics)
	mux16000.HandleFunc("/api/sync-tpl", syncTplHandler)
	mux16000.HandleFunc("/api/transaction", recordTransaction)
	mux16000.HandleFunc("/api/transactions", apiGetTransactions)

	mux16000.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		cleanedPath := filepath.Clean(r.URL.Path)
		if len(cleanedPath) >= 5 && cleanedPath[:5] == "/api/" {
			http.Error(w, "API End Point Not Found", http.StatusNotFound)
			return
		}
		path := cleanedPath
		if path == "/" || path == "." {
			path = "index.html"
		} else {
			path = filepath.Base(path)
		}
		if path != "index.html" && path != "manual.html" && path != "leaderboard.html" {
			http.Error(w, "Access Forbidden", http.StatusForbidden)
			return
		}
		http.ServeFile(w, r, filepath.Join(baseDir, path))
	})

	createCORSHandler := func(mux *http.ServeMux) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusOK)
				return
			}
			mux.ServeHTTP(w, r)
		})
	}

	// --------------------------------------------------
	// NEW PORT 5000 SERVER SETUP (RUNS IN BACKGROUND)
	// --------------------------------------------------
	mux5000 := http.NewServeMux()
	mux5000.HandleFunc("/api/leaderboard", apiLeaderboard)

	mux5000.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		cleanedPath := filepath.Clean(r.URL.Path)
		if len(cleanedPath) >= 5 && cleanedPath[:5] == "/api/" {
			http.Error(w, "API End Point Not Found", http.StatusNotFound)
			return
		}

		path := cleanedPath
		if path == "/" || path == "." {
			path = "leaderboard.html" 
		} else {
			path = filepath.Base(path)
		}
		
		if path != "leaderboard.html" {
			http.Error(w, "Access Forbidden on Port 5000", http.StatusForbidden)
			return
		}
		http.ServeFile(w, r, filepath.Join(baseDir, path))
	})

	go func() {
		if err := http.ListenAndServe(":5000", createCORSHandler(mux5000)); err != nil {
			log.Fatalf("Port 5000 server failed: %v", err)
		}
	}()

	// --------------------------------------------------
	// SEQUENTIAL TERMINAL PRINTS & PRIMARY SERVER START
	// --------------------------------------------------
	fmt.Print("\033[H\033[2J") // Clear screen

	fmt.Println("\033[35m==================================================\033[0m")
	fmt.Println("\033[36m    ASHOKA UNIVERSAL SCHOOL MOCK-STOCK ENGINE     \033[0m")
	fmt.Println("\033[35m==================================================\033[0m")

	fmt.Printf("\033[34m[INFO]\033[0m    Database bound to: \033[33m%s\033[0m\n", databaseFile)
	fmt.Printf("\033[34m[INFO]\033[0m    Analytics trace bound to: \033[33m%s\033[0m\n", databaseFile)

	fmt.Printf("\033[32m[SUCCESS]\033[0m Main Trading Engine live on port: \033[33m16000\033[0m\n")
	fmt.Printf("\033[32m[SUCCESS]\033[0m Leaderboard Engine live on port: \033[33m5000\033[0m\n")

	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", Port), createCORSHandler(mux16000)))
}