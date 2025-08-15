// ======= app.js =======

// Sections
const authContainer = document.getElementById("auth-container");
const authCard = document.getElementById("auth-card");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnLogin = document.getElementById("btn-login");
const btnGuest = document.getElementById("btn-guest");
const authMsg = document.getElementById("authMsg");
const whoami = document.getElementById("whoami");
const authWhenLoggedIn = document.getElementById("auth-when-logged-in");
const btnLogout = document.getElementById("btn-logout");
const themeBtn = document.getElementById("theme");

const summarySection = document.getElementById("summary");
const marketSection = document.getElementById("market-section");
const adminPanel = document.getElementById("admin-panel");

// Admin controls
const adminUserEmail = document.getElementById("admin-user-email");
const adminUserPassword = document.getElementById("admin-user-password");
const btnCreateUser = document.getElementById("admin-create-user");
const btnChangePassword = document.getElementById("admin-change-password");
const btnDeleteUser = document.getElementById("admin-delete-user");
const adminUserMsg = document.getElementById("admin-user-msg");
const btnViewAnalytics = document.getElementById("admin-view-analytics");
const analyticsOutput = document.getElementById("analytics-output");
const btnTickMarket = document.getElementById("btn-tick");

// Trade modal
const tradeModal = document.getElementById("trade");
const tradeTitle = document.getElementById("tradeTitle");
const tradePrice = document.getElementById("tradePrice");
const qtyInput = document.getElementById("qty");
const btnBuy = document.getElementById("buy");
const btnSell = document.getElementById("sell");
const btnCancelTrade = document.getElementById("cancel");
const tradeMsg = document.getElementById("tradeMsg");

// ======= Data Initialization =======
let users = JSON.parse(localStorage.getItem("users")) || [
    { username: "Admin", password: "Admin_123", role: "admin", cash: 100000, holdings: {} },
];

let stocks = JSON.parse(localStorage.getItem("stocks")) || [
    { symbol: "AAPL", name: "Apple", price: 150 },
    { symbol: "GOOGL", name: "Google", price: 2800 },
    { symbol: "MSFT", name: "Microsoft", price: 300 },
    { symbol: "TSLA", name: "Tesla", price: 700 },
];

let currentUser = null;

// ======= Helpers =======
function saveUsers() {
    localStorage.setItem("users", JSON.stringify(users));
}

function saveStocks() {
    localStorage.setItem("stocks", JSON.stringify(stocks));
}

// ======= Theme Toggle =======
themeBtn?.addEventListener("click", () => {
    document.body.classList.toggle("dark");
});

// ======= Login/Logout =======
btnLogin.addEventListener("click", () => {
    const username = emailInput.value.trim();
    const password = passwordInput.value.trim();

    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        currentUser = user;
        loginUser();
        authMsg.textContent = "";
    } else {
        authMsg.textContent = "Invalid credentials!";
    }
});

btnGuest.addEventListener("click", () => {
    currentUser = { username: "Guest", role: "guest", cash: 50000, holdings: {} };
    loginUser();
});

btnLogout.addEventListener("click", () => {
    currentUser = null;
    authContainer.classList.remove("hidden");
    authWhenLoggedIn.classList.add("hidden");
    summarySection.classList.add("hidden");
    marketSection.classList.add("hidden");
    adminPanel.classList.add("hidden");
});

// ======= Login Setup =======
function loginUser() {
    authContainer.classList.add("hidden");
    authWhenLoggedIn.classList.remove("hidden");
    whoami.textContent = currentUser.username;

    // Show trading sections
    summarySection.classList.remove("hidden");
    marketSection.classList.remove("hidden");

    // Admin-specific features
    if (currentUser.role === "admin") {
        adminPanel.classList.remove("hidden");
        btnTickMarket.classList.remove("hidden");
    } else {
        adminPanel.classList.add("hidden");
        btnTickMarket.classList.add("hidden");
    }

    // Render portfolio & market
    renderPortfolio();
    renderMarket();
}

// ======= Portfolio Rendering =======
function renderPortfolio() {
    const cashEl = document.getElementById("cash");
    const investedEl = document.getElementById("invested");
    const currentValueEl = document.getElementById("currentValue");
    const plEl = document.getElementById("pl");
    const holdingsList = document.getElementById("holdingsList");

    const holdings = currentUser.holdings || {};
    let invested = 0;
    let currentValue = 0;

    let holdingsHTML = "";

    for (let symbol in holdings) {
        const stock = stocks.find(s => s.symbol === symbol);
        if (!stock) continue;
        const qty = holdings[symbol];
        invested += qty * stock.price; // Assuming bought at current price
        currentValue += qty * stock.price;

        holdingsHTML += `<div class="holding-item p-2 rounded-md flex justify-between">
            <span>${stock.name} (${symbol}) x${qty}</span>
            <span>$${(qty * stock.price).toFixed(2)}</span>
        </div>`;
    }

    holdingsList.innerHTML = holdingsHTML || "<p>No holdings yet.</p>";

    cashEl.textContent = `$${currentUser.cash.toFixed(2)}`;
    investedEl.textContent = `$${invested.toFixed(2)}`;
    currentValueEl.textContent = `$${currentValue.toFixed(2)}`;
    plEl.textContent = `$${(currentValue + currentUser.cash - 100000).toFixed(2)}`; // assuming starting cash 100k
}

// ======= Market Rendering =======
function renderMarket() {
    const marketEl = document.getElementById("market");
    marketEl.innerHTML = "";

    stocks.forEach(stock => {
        const card = document.createElement("div");
        card.className = "card p-4 rounded-md shadow-md flex flex-col gap-2";

        const nameEl = document.createElement("div");
        nameEl.textContent = `${stock.name} (${stock.symbol})`;
        nameEl.className = "font-bold";

        const priceEl = document.createElement("div");
        priceEl.textContent = `$${stock.price.toFixed(2)}`;
        priceEl.className = "price";

        const btnTrade = document.createElement("button");
        btnTrade.textContent = "Trade";
        btnTrade.className = "btn bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600";
        btnTrade.addEventListener("click", () => openTradeModal(stock));

        card.appendChild(nameEl);
        card.appendChild(priceEl);
        card.appendChild(btnTrade);

        marketEl.appendChild(card);
    });
}

// ======= Trade Modal =======
function openTradeModal(stock) {
    tradeModal.showModal();
    tradeTitle.textContent = `${stock.name} (${stock.symbol})`;
    tradePrice.textContent = `Price: $${stock.price.toFixed(2)}`;
    qtyInput.value = 1;
    tradeMsg.textContent = "";

    btnBuy.onclick = () => {
        const qty = parseInt(qtyInput.value);
        const cost = stock.price * qty;
        if (currentUser.cash >= cost) {
            currentUser.cash -= cost;
            currentUser.holdings = currentUser.holdings || {};
            currentUser.holdings[stock.symbol] = (currentUser.holdings[stock.symbol] || 0) + qty;
            saveUsers();
            renderPortfolio();
            tradeMsg.textContent = `Bought ${qty} shares!`;
        } else {
            tradeMsg.textContent = "Not enough cash!";
        }
    };

    btnSell.onclick = () => {
        const qty = parseInt(qtyInput.value);
        currentUser.holdings = currentUser.holdings || {};
        if ((currentUser.holdings[stock.symbol] || 0) >= qty) {
            currentUser.holdings[stock.symbol] -= qty;
            if (currentUser.holdings[stock.symbol] === 0) delete currentUser.holdings[stock.symbol];
            currentUser.cash += stock.price * qty;
            saveUsers();
            renderPortfolio();
            tradeMsg.textContent = `Sold ${qty} shares!`;
        } else {
            tradeMsg.textContent = "Not enough shares!";
        }
    };

    btnCancelTrade.onclick = () => tradeModal.close();
}

// ======= Admin Functions =======
btnCreateUser.addEventListener("click", () => {
    const username = adminUserEmail.value.trim();
    const password = adminUserPassword.value.trim();
    if (!username || !password) {
        adminUserMsg.textContent = "Enter username and password!";
        return;
    }
    if (users.find(u => u.username === username)) {
        adminUserMsg.textContent = "User already exists!";
        return;
    }
    users.push({ username, password, role: "user", cash: 100000, holdings: {} });
    saveUsers();
    adminUserMsg.textContent = `User "${username}" created!`;
});

btnChangePassword.addEventListener("click", () => {
    const username = adminUserEmail.value.trim();
    const password = adminUserPassword.value.trim();
    const user = users.find(u => u.username === username);
    if (!user) {
        adminUserMsg.textContent = "User not found!";
        return;
    }
    user.password = password;
    saveUsers();
    adminUserMsg.textContent = `Password for "${username}" updated!`;
});

btnDeleteUser.addEventListener("click", () => {
    const username = adminUserEmail.value.trim();
    const index = users.findIndex(u => u.username === username);
    if (index === -1) {
        adminUserMsg.textContent = "User not found!";
        return;
    }
    if (users[index].role === "admin") {
        adminUserMsg.textContent = "Cannot delete Admin!";
        return;
    }
    users.splice(index, 1);
    saveUsers();
    adminUserMsg.textContent = `User "${username}" deleted!`;
});

btnViewAnalytics.addEventListener("click", () => {
    analyticsOutput.innerHTML = users.map(u => {
        return `<p>${u.username} - Role: ${u.role} - Cash: $${u.cash.toFixed(2)} - Holdings: ${JSON.stringify(u.holdings)}</p>`;
    }).join("");
});

// ======= Market Tick (Admin Only) =======
btnTickMarket.addEventListener("click", () => {
    stocks.forEach(s => {
        const change = (Math.random() - 0.5) * 10; // random -5 to +5
        s.price = Math.max(1, s.price + change);
    });
    saveStocks();
    renderMarket();
    renderPortfolio();
});

// ======= Initial Rendering =======
renderMarket();
