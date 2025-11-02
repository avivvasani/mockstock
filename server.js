import express from "express";
import cors from "cors";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { stockData } from "./stockData.js"; // File import name

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); 

// --- Configuration & Data Setup ---
const dataDir = path.join(__dirname, "data");
const usersDir = path.join(dataDir, "users");
await fs.ensureDir(usersDir);
await fs.ensureFile(path.join(dataDir, "prices.json"));
await fs.ensureFile(path.join(dataDir, "history.json")); 

// --- Global State ---
let usdInr = 83.0; // Mock USD to INR rate, used for all calculations
let prices = {};
let history = {}; 
let categoryTrends = {}; 
let stockPressure = {}; 

// --- Initial User Balance ---
const INITIAL_BALANCE_INR = 1000000.00;

// 🕒 Mock USD→INR rate update (remove if using using actual API)
// async function updateUSDINR() {
//   try {
//     const res = await axios.get(
//       `https://finnhub.io/api/v1/forex/rates?token=${FINNHUB_API_KEY}`
//     );
//     usdInr = res.data.quote?.INR || res.data.r?.INR || usdInr;
//     console.log(`💱 USD→INR updated: ${usdInr.toFixed(2)}`);
//   } catch (error) {
//     console.error("Error fetching USD→INR:", error.message);
//   }
// }
// updateUSDINR();
// setInterval(updateUSDINR, 30000); 

// --- Sequence Trend Logic ---
// Implements: up, up, up, down, down sequence
const marketSequence = ['up', 'up', 'up', 'down', 'down'];
let sequenceIndex = 0; 
const SEQUENCE_DURATION = 60; // Duration (in seconds) for each step

function initializeCategoryTrends() {
    stockData.forEach((category) => {
        categoryTrends[category.category] = {
            trend: marketSequence[sequenceIndex],
            updatesRemaining: SEQUENCE_DURATION,
            isManual: false,
        };
    });
}
initializeCategoryTrends(); 

async function updateStockPrices() {
  try {
    const timestamp = new Date().toISOString();

    // 1. Decay Market Pressure (User Trades)
    Object.keys(stockPressure).forEach(symbol => {
        stockPressure[symbol] *= 0.9; 
        if (Math.abs(stockPressure[symbol]) < 0.1) {
            stockPressure[symbol] = 0;
        }
    });
    
    // 2. Update Global Sequence Index for categories not manually overridden
    let shouldAdvanceSequence = true;
    stockData.forEach(category => {
        const trendState = categoryTrends[category.category];

        if (trendState.isManual) {
             // Decrement manual timer
            if (trendState.updatesRemaining > 0) {
                trendState.updatesRemaining--;
            } else {
                // Manual override expired, return to automatic sequence
                trendState.isManual = false;
                trendState.updatesRemaining = 0; 
            }
        }
        
        // Check if any non-manual category is still counting down
        if (!trendState.isManual && trendState.updatesRemaining > 0) {
            shouldAdvanceSequence = false;
        }
    });

    if (shouldAdvanceSequence) {
        sequenceIndex = (sequenceIndex + 1) % marketSequence.length;
        const newTrend = marketSequence[sequenceIndex];
        
        // Reset updatesRemaining and apply new trend for ALL non-manual categories
        stockData.forEach(category => {
            const trendState = categoryTrends[category.category];
            if (!trendState.isManual) {
                trendState.trend = newTrend;
                trendState.updatesRemaining = SEQUENCE_DURATION;
            }
        });
        console.log(`\nMarket sequence advanced to: ${newTrend.toUpperCase()}`);
    } else {
        // Decrease remaining time for all non-manual categories
        stockData.forEach(category => {
            if (!categoryTrends[category.category].isManual && categoryTrends[category.category].updatesRemaining > 0) {
                categoryTrends[category.category].updatesRemaining--;
            }
        });
    }

    // 3. Update Stock Prices
    stockData.forEach(category => {
      const categoryName = category.category;
      const trendState = categoryTrends[categoryName];
      
      category.stocks.forEach(stock => {
        const symbol = stock.symbol;
        if (!symbol) return;

        const initialPrice = stock.initialPrice || stock.price; // USD reference price
        let currentPrice = prices[symbol]?.price || initialPrice; // Stored in USD
        
        const baseVolatility = 0.005; 
        const stockVolatility = stock.volatility || baseVolatility; 
        
        const trend = trendState.trend;
        let factor;

        // Base Price Change (Category Trend)
        if (trend === 'up') {
            factor = 1 + (Math.random() * stockVolatility * 0.4) + (stockVolatility * 0.6); 
        } else if (trend === 'down') {
            factor = 1 - (Math.random() * stockVolatility * 0.4) - (stockVolatility * 0.4); 
        } else { // 'none' trend 
            factor = 1 + (Math.random() * 2 - 1) * stockVolatility;
        }

        const paceMultiplier = (stockVolatility / baseVolatility) * 0.5 + 0.5; 
        factor = 1 + (factor - 1) * paceMultiplier;

        // Apply Pressure Bias (User Transactions)
        const pressureInfluence = 0.0001; 
        const currentPressure = stockPressure[symbol] || 0;
        const pressureBias = currentPressure * pressureInfluence; 
        
        factor += pressureBias; 

        let newPriceUSD = +(currentPrice * factor).toFixed(2);
        
        // Price Floor Constraint
        const PRICE_FLOOR = initialPrice * 0.05; 
        if (newPriceUSD < PRICE_FLOOR) newPriceUSD = PRICE_FLOOR;
        
        // --- NO PRICE CEILING as requested ---

        // Update price data (Stored in USD)
        const newPriceINR = +(newPriceUSD * usdInr).toFixed(2);
        const initialPriceINR = +(initialPrice * usdInr).toFixed(2);
        
        const updatedPriceData = {
          name: stock.name,
          symbol: symbol,
          category: categoryName,
          price: newPriceUSD, // USD price (internal calculation base)
          priceINR: newPriceINR, // INR price for display and transactions
          changePercent: ((newPriceINR - initialPriceINR) / initialPriceINR) * 100, 
          updatedAt: timestamp
        };
        prices[symbol] = updatedPriceData;
        
        // History for stock graphs (Stored in INR)
        if (!history[symbol]) history[symbol] = [];
        history[symbol].push({ time: timestamp, price: updatedPriceData.priceINR });
        
        const MAX_HISTORY = 600; 
        if (history[symbol].length > MAX_HISTORY) {
            history[symbol].splice(0, history[symbol].length - MAX_HISTORY);
        }
      });
    });
    
    // 4. Calculate and Store Category Aggregate History (Stored in INR)
    stockData.forEach(category => {
        const categoryName = category.category;
        let totalCategoryPriceINR = 0;
        let stockCount = 0;
        
        category.stocks.forEach(stock => {
            if (prices[stock.symbol]) {
                totalCategoryPriceINR += prices[stock.symbol].priceINR; 
                stockCount++;
            }
        });
        
        if (stockCount > 0) {
            const avgPriceINR = +(totalCategoryPriceINR / stockCount).toFixed(2);
            
            // Use category name as the symbol for history
            if (!history[categoryName]) history[categoryName] = [];
            history[categoryName].push({ time: timestamp, price: avgPriceINR }); 
            
            const MAX_HISTORY = 600; 
            if (history[categoryName].length > MAX_HISTORY) {
                history[categoryName].splice(0, history[categoryName].length - MAX_HISTORY);
            }
        }
    });

    await fs.writeJson(path.join(dataDir, "prices.json"), prices, { spaces: 2 });
    await fs.writeJson(path.join(dataDir, "history.json"), history, { spaces: 2 });
    
  } catch (err) {
    console.error("❌ Error during price update loop:", err.message);
  }
}

updateStockPrices();
setInterval(updateStockPrices, 1000); 

// --- API Endpoints ---

// Helper function to create a new user with INR 1,000,000 balance
async function initializeUser(username) {
     const userFile = path.join(usersDir, `${username}.json`);
     if (await fs.pathExists(userFile)) {
        return await fs.readJson(userFile);
     }
     
     const newUser = {
        username: username,
        balance: INITIAL_BALANCE_INR, // ₹1,000,000
        holdings: {}, 
        transactions: [],
        watchlist: [],
        portfolioValue: INITIAL_BALANCE_INR, // Initially just the balance
        lastLogin: new Date().toISOString()
     };
     await fs.writeJson(userFile, newUser, { spaces: 2 });
     return newUser;
}

// 1. Login/Signup Endpoint (Updated to set initial INR balance)
app.post("/api/login", async (req, res) => {
    try {
      const { username } = req.body;
      const user = await initializeUser(username);
      res.json(user);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to process login" });
    }
});

// 2. Buy Transaction (Updated to use priceINR)
app.post("/api/buy", async (req, res) => {
  try {
    const { username, symbol, quantity: quantityString } = req.body;
    const quantity = parseInt(quantityString);
    if (quantity <= 0 || isNaN(quantity)) return res.status(400).json({ error: "Invalid quantity" });

    const userFile = path.join(usersDir, `${username}.json`);
    const user = await fs.readJson(userFile);
    const stock = prices[symbol];
    
    // *** Use priceINR for transaction calculation ***
    const totalCost = stock.priceINR * quantity; 

    if (user.balance < totalCost) {
      return res.status(400).json({ error: "Insufficient balance in INR" });
    }
    
    user.balance -= totalCost;
    user.holdings[symbol] = (user.holdings[symbol] || 0) + quantity;

    stockPressure[symbol] = (stockPressure[symbol] || 0) + quantity; // Apply pressure

    user.transactions.push({
      type: "BUY",
      symbol,
      quantity,
      price: stock.priceINR, // Record INR price
      time: new Date().toISOString()
    });

    await fs.writeJson(userFile, user, { spaces: 2 });
    res.json({ message: "Bought successfully", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process buy order" });
  }
});

// 3. Sell Transaction (Updated to use priceINR)
app.post("/api/sell", async (req, res) => {
  try {
    const { username, symbol, quantity: quantityString } = req.body;
    const quantity = parseInt(quantityString);
    if (quantity <= 0 || isNaN(quantity)) return res.status(400).json({ error: "Invalid quantity" });

    const userFile = path.join(usersDir, `${username}.json`);
    const user = await fs.readJson(userFile);

    if (!user.holdings[symbol] || user.holdings[symbol] < quantity) {
      return res.status(400).json({ error: "Not enough shares to sell" });
    }

    const stock = prices[symbol];
    // *** Use priceINR for transaction calculation ***
    const totalGain = stock.priceINR * quantity;

    user.balance += totalGain;
    user.holdings[symbol] -= quantity;
    if (user.holdings[symbol] === 0) delete user.holdings[symbol];

    stockPressure[symbol] = (stockPressure[symbol] || 0) - quantity; // Apply negative pressure

    user.transactions.push({
      type: "SELL",
      symbol,
      quantity,
      price: stock.priceINR, // Record INR price
      time: new Date().toISOString()
    });

    await fs.writeJson(userFile, user, { spaces: 2 });
    res.json({ message: "Sold successfully", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process sell order" });
  }
});

// 4. Live Prices (for index.html)
app.get("/api/prices", async (req, res) => {
  try {
    const data = await fs.readJson(path.join(dataDir, "prices.json"));
    res.json({
      timestamp: new Date().toISOString(),
      data
    });
  } catch {
    res.status(500).json({ error: "Could not load prices." });
  }
});

// 5. User Portfolio
app.get("/api/portfolio/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const userFile = path.join(usersDir, `${username}.json`);
    const user = await fs.readJson(userFile);
    res.json(user);
  } catch (err) {
    // If the user file doesn't exist, assume new user logic will handle it (e.g., via login)
    res.status(404).json({ error: "User not found." });
  }
});


// 6. Status (for admin.html)
app.get("/api/status", (req, res) => {
    const trends = stockData.map(category => {
      const trendState = categoryTrends[category.category];
      return {
          name: category.category,
          trend: trendState.trend,
          updatesRemaining: trendState.updatesRemaining,
          isManual: trendState.isManual,
          // Expose the current step of the master sequence for reference
          currentSequence: trendState.isManual ? 'MANUAL' : marketSequence[sequenceIndex]
      };
    });
    
    res.json({
        categoryTrends: trends
    });
});

// 7. History (for graphs.html)
app.get("/api/history", async (req, res) => {
    try {
        let data = {};
        const filePath = path.join(dataDir, "history.json");
        if (await fs.pathExists(filePath)) {
             data = await fs.readJson(filePath).catch(() => ({}));
        }
        res.json(data);
    } catch (err) {
        console.error("Error serving history data:", err.message);
        res.status(500).json({ error: "Could not load historical data." });
    }
});

// 8. Manual Control (for admin.html)
app.post("/api/control", (req, res) => {
    const { category, trend } = req.body; 
    
    if (categoryTrends[category]) {
        categoryTrends[category].trend = trend;
        categoryTrends[category].updatesRemaining = 60; // 60 seconds of manual override
        categoryTrends[category].isManual = true;
        
        console.log(`\n\n📢 MANUAL CONTROL: ${category} trend set to ${trend.toUpperCase()} for 60 seconds.`);
        
        res.json({ success: true, message: `Trend for ${category} set to ${trend}` });
    } else {
        res.status(400).json({ success: false, message: `Category ${category} not found.` });
    }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MockStock backend running at http://localhost:${PORT}`);
});
