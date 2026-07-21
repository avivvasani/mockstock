package main

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"

	_ "modernc.org/sqlite"
)

const (
	TX_DB       = "database.db"
	HIST_DB     = "stock_history.db"
	CSV_DISC    = "discrepancies.log.csv"
	CSV_FINANCE = "audited_financials.csv"
	SLIPPAGE_PCT = 0.10 // Flag trades executed 10% away from true market value
)

// --- COLORS ---
const (
	Reset  = "\033[0m"
	Green  = "\033[32m"
	Blue   = "\033[34m"
	Yellow = "\033[33m"
	Red    = "\033[31m"
	Cyan   = "\033[36m"
	Gray   = "\033[90m"
)

type Transaction struct {
	ID        string
	Timestamp string
	Action    string
	Stock     string
	Price     float64
	Player    string
	Quantity  int
}

type DiscrepancyLog struct {
	SourceTable string
	TxID        string
	Timestamp   string
	StockName   string
	TxState     string // e.g., "Price/Qty"
	ActState    string // e.g., "Expected Price/Qty"
	Status      string
}

type PlayerSummary struct {
	Username      string
	TotalVolume   float64
	RealizedPL    float64
	UnrealizedPL  float64
	CurrentAssets float64
	Anomalies     int
}

type StockLot struct {
	Price float64
	Qty   int
}

func main() {
	fmt.Print("\033[H\033[2J") // Clear terminal space
	fmt.Printf("%sForensic Multi-Table Ledger & Inventory Engine v2.0%s\n", Blue, Reset)
	fmt.Printf("Strict Audit Mode: Active | Slippage Tolerance: %.0f%%\n\n", SLIPPAGE_PCT*100)

	txDB, err := sql.Open("sqlite", TX_DB)
	if err != nil {
		fmt.Printf("%s[FATAL] Failed to connect to %s: %v%s\n", Red, TX_DB, err, Reset)
		return
	}
	defer txDB.Close()

	histDB, err := sql.Open("sqlite", HIST_DB)
	if err != nil {
		fmt.Printf("%s[FATAL] Failed to connect to %s: %v%s\n", Red, HIST_DB, err, Reset)
		return
	}
	defer histDB.Close()

	tables := getActiveTables(txDB)
	if len(tables) == 0 {
		fmt.Printf("%s[FATAL] Zero data tables detected!%s\n", Red, Reset)
		return
	}
	fmt.Printf("%s[SYSTEM] Scanning %d user ledgers chronologically...%s\n", Gray, len(tables), Reset)

	var allDiscrepancies []DiscrepancyLog
	var allSummaries []PlayerSummary
	globalMismatchCount := 0

	for _, tableName := range tables {
		columns, err := getTableColumns(txDB, tableName)
		if err != nil {
			continue
		}

		idCol := findColumn(columns, []string{"id", "transaction_id", "tx_id"})
		timeCol := findColumn(columns, []string{"time", "timestamp", "date"})
		actionCol := findColumn(columns, []string{"type", "action", "side"})
		stockCol := findColumn(columns, []string{"stock", "ticker", "symbol"})
		priceCol := findColumn(columns, []string{"price_ps", "price", "amount"})
		qtyCol := findColumn(columns, []string{"quantity", "qty", "volume"})

		if timeCol == "" || stockCol == "" || priceCol == "" {
			continue
		}

		portfolio := make(map[string][]StockLot)
		summary := PlayerSummary{Username: tableName}

		var selectFields []string
		if idCol != "" { selectFields = append(selectFields, fmt.Sprintf(`"%s"`, idCol)) }
		selectFields = append(selectFields, fmt.Sprintf(`"%s"`, timeCol), fmt.Sprintf(`"%s"`, stockCol), fmt.Sprintf(`"%s"`, priceCol))
		if actionCol != "" { selectFields = append(selectFields, fmt.Sprintf(`"%s"`, actionCol)) }
		if qtyCol != "" { selectFields = append(selectFields, fmt.Sprintf(`"%s"`, qtyCol)) }

		// STRICT CHRONOLOGICAL ORDERING
		query := fmt.Sprintf(`SELECT %s FROM "%s" ORDER BY "%s" ASC`, strings.Join(selectFields, ", "), tableName, timeCol)
		rows, err := txDB.Query(query)
		if err != nil {
			continue
		}

		for rows.Next() {
			var tx Transaction
			var dests []interface{}

			if idCol != "" { dests = append(dests, &tx.ID) } else { tx.ID = "N/A" }
			dests = append(dests, &tx.Timestamp, &tx.Stock, &tx.Price)
			if actionCol != "" { dests = append(dests, &tx.Action) } else { tx.Action = "BUY" }
			if qtyCol != "" { dests = append(dests, &tx.Quantity) } else { tx.Quantity = 1 }

			if err := rows.Scan(dests...); err != nil {
				continue
			}

			// --- MARKET PRICE DISCOVERY ---
			var actPrice float64
			histQ := fmt.Sprintf(`SELECT price FROM "%s" WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1`, tx.Stock)
			err = histDB.QueryRow(histQ, tx.Timestamp).Scan(&actPrice)
			
			if err != nil {
				globalMismatchCount++
				summary.Anomalies++
				allDiscrepancies = append(allDiscrepancies, DiscrepancyLog{tableName, tx.ID, tx.Timestamp, tx.Stock, fmt.Sprintf("$%.2f", tx.Price), "NONE", "MISSING_HISTORY"})
				actPrice = tx.Price 
			} else {
				// Slippage & Manipulation Check
				slippage := math.Abs(tx.Price - actPrice) / actPrice
				if slippage > SLIPPAGE_PCT {
					globalMismatchCount++
					summary.Anomalies++
					allDiscrepancies = append(allDiscrepancies, DiscrepancyLog{tableName, tx.ID, tx.Timestamp, tx.Stock, fmt.Sprintf("$%.2f", tx.Price), fmt.Sprintf("$%.2f", actPrice), "HIGH_SLIPPAGE/MANIPULATION"})
				} else if tx.Price != actPrice {
					globalMismatchCount++
					summary.Anomalies++
					allDiscrepancies = append(allDiscrepancies, DiscrepancyLog{tableName, tx.ID, tx.Timestamp, tx.Stock, fmt.Sprintf("$%.2f", tx.Price), fmt.Sprintf("$%.2f", actPrice), "MINOR_PRICE_MISMATCH"})
				}
			}

			actionUpper := strings.ToUpper(tx.Action)
			isSell := strings.Contains(actionUpper, "SELL") || strings.Contains(actionUpper, "OUT")

			if !isSell {
				// BUY ACTION
				portfolio[tx.Stock] = append(portfolio[tx.Stock], StockLot{Price: actPrice, Qty: tx.Quantity})
				summary.TotalVolume += actPrice * float64(tx.Quantity)
			} else {
				// SELL ACTION WITH INVENTORY VALIDATION
				available := 0
				for _, lot := range portfolio[tx.Stock] { available += lot.Qty }

				if available == 0 {
					globalMismatchCount++
					summary.Anomalies++
					allDiscrepancies = append(allDiscrepancies, DiscrepancyLog{tableName, tx.ID, tx.Timestamp, tx.Stock, fmt.Sprintf("%d shares", tx.Quantity), "0 shares", "NAKED_SHORT_REMOVED"})
					continue
				}

				adjQty := tx.Quantity
				if tx.Quantity > available {
					globalMismatchCount++
					summary.Anomalies++
					allDiscrepancies = append(allDiscrepancies, DiscrepancyLog{tableName, tx.ID, tx.Timestamp, tx.Stock, fmt.Sprintf("%d shares", tx.Quantity), fmt.Sprintf("%d shares", available), "PARTIAL_SHORT_SCALED"})
					adjQty = available
				}

				// FIFO ACCOUNTING
				rem := adjQty
				var costBasis float64
				for rem > 0 && len(portfolio[tx.Stock]) > 0 {
					lot := &portfolio[tx.Stock][0]
					if lot.Qty <= rem {
						rem -= lot.Qty
						costBasis += float64(lot.Qty) * lot.Price
						portfolio[tx.Stock] = portfolio[tx.Stock][1:]
					} else {
						costBasis += float64(rem) * lot.Price
						lot.Qty -= rem
						rem = 0
					}
				}

				revenue := float64(adjQty) * actPrice
				summary.RealizedPL += (revenue - costBasis)
				summary.TotalVolume += revenue
			}
		}
		rows.Close()

		// --- END OF LEDGER UNREALIZED PL VALUATION ---
		for stock, lots := range portfolio {
			if len(lots) == 0 { continue }
			var latestPrice float64
			err := histDB.QueryRow(fmt.Sprintf(`SELECT price FROM "%s" ORDER BY timestamp DESC LIMIT 1`, stock)).Scan(&latestPrice)
			if err != nil { latestPrice = lots[0].Price } // Fallback

			for _, lot := range lots {
				currentValue := float64(lot.Qty) * latestPrice
				originalCost := float64(lot.Qty) * lot.Price
				summary.CurrentAssets += currentValue
				summary.UnrealizedPL += (currentValue - originalCost)
			}
		}

		allSummaries = append(allSummaries, summary)
		if summary.TotalVolume > 0 {
			color := Green
			if summary.RealizedPL < 0 { color = Red }
			fmt.Printf("%s[AUDITED] %-20s | Realized P&L: %s₹%.2f%s | Assets: ₹%.2f%s\n", Gray, truncateString(summary.Username, 20), color, summary.RealizedPL, Gray, summary.CurrentAssets, Reset)
		}
	}

	// --- FILE EXPORTING ---
	if len(allDiscrepancies) > 0 {
		file, _ := os.Create(CSV_DISC)
		w := csv.NewWriter(file)
		// MODIFIED: Removed Player and TxID columns from the header and row writing
		w.Write([]string{"Timestamp", "Stock", "Logged State", "Audited State", "Flag Type"})
		for _, d := range allDiscrepancies { 
			w.Write([]string{d.Timestamp, d.StockName, d.TxState, d.ActState, d.Status}) 
		}
		w.Flush()
		file.Close()
	} else { os.Remove(CSV_DISC) }

	fileFin, _ := os.Create(CSV_FINANCE)
	wFin := csv.NewWriter(fileFin)
	wFin.Write([]string{"Player", "Total Volume Audited", "Realized P&L", "Unrealized P&L (Active Holds)", "Current Asset Value", "Total Anomalies Flagged"})
	for _, s := range allSummaries {
		wFin.Write([]string{s.Username, fmt.Sprintf("%.2f", s.TotalVolume), fmt.Sprintf("%.2f", s.RealizedPL), fmt.Sprintf("%.2f", s.UnrealizedPL), fmt.Sprintf("%.2f", s.CurrentAssets), strconv.Itoa(s.Anomalies)})
	}
	wFin.Flush()
	fileFin.Close()

	fmt.Printf("\n%s[AUDIT COMPLETE] %d anomalies intercepted and sanitized.%s\n", Cyan, globalMismatchCount, Reset)
	fmt.Printf("Financial summaries exported to: %s\n", CSV_FINANCE)
}

func getActiveTables(db *sql.DB) []string {
	rows, _ := db.Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'analytics'")
	var tables []string
	for rows.Next() {
		var n string
		rows.Scan(&n)
		tables = append(tables, n)
	}
	return tables
}

func getTableColumns(db *sql.DB, t string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf(`PRAGMA table_info("%s")`, t))
	if err != nil { return nil, err }
	var cols []string
	for rows.Next() {
		var cid, notnull, pk int
		var name, ctype string
		var dflt interface{}
		rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk)
		cols = append(cols, name)
	}
	return cols, nil
}

func findColumn(cols []string, targets []string) string {
	for _, c := range cols {
		lc := strings.ToLower(c)
		for _, t := range targets { if lc == t { return c } }
	}
	return ""
}

func truncateString(str string, num int) string {
	if len(str) > num { return str[0:num-3] + "..." }
	return str
}