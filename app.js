// Complete app.js for MockStock with full trading and admin functionality

// ------------------------------
// Elements
// ------------------------------
const authContainer = document.getElementById("auth-container");
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
const btnTick = document.getElementById("btn-tick");

// Admin Controls
const adminUserEmail = document.getElementById("admin-user-email");
const adminUserPassword = document.getElementById("admin-user-password");
const btnCreateUser = document.getElementById("admin-create-user");
const btnChangePassword = document.getElementById("admin-change-password");
const btnDeleteUser = document.getElementById("admin-delete-user");
const adminUserMsg = document.getElementById("admin-user-msg");
const btnViewAnalytics = document.getElementById("admin-view-analytics");
const analyticsOutput = document.getElementById("analytics-output");

// Trade modal elements
const tradeModal = document.getElementById("trade");
const tradeTitle = document.getElementById("tradeTitle");
const tradePrice = document.getElementById("tradePrice");
const qtyInput = document.getElementById("qty");
const buyBtn = document.getElementById("buy");
const sellBtn = document.getElementById("sell");
const cancelBtn = document.getElementById("cancel");
const tradeMsg = document.getElementById("tradeMsg");

// ------------------------------
// LocalStorage & Data
// ------------------------------
let users = JSON.parse(localStorage.getItem("users")) || [{ username: "Admin", password: "Admin_123", role: "admin", cash: 100000, holdings: [] }];
let stocks = JSON.parse(localStorage.getItem("stocks")) || [
    { symbol: "AAPL", name: "Apple", price: 150, category: "Tech" },
    { symbol: "GOOG", name: "Google", price: 2800, category: "Tech" },
    { symbol: "TSLA", name: "Tesla", price: 700, category: "Auto" },
];

let currentUser = null;

// ------------------------------
// Theme toggle
// ------------------------------
themeBtn?.addEventListener("click", () => {
    document.body.classList.toggle("dark");
});

// ------------------------------
// Login / Logout / Guest
// ------------------------------
btnLogin.addEventListener("click", () => {
    const username = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        currentUser = user;
        authMsg.textContent = "";
        loginUser();
    } else {
        authMsg.textContent = "Invalid credentials!";
    }
});

btnGuest.addEventListener("click", () => {
    currentUser = { username: "Guest", role: "guest", cash: 100000, holdings: [] };
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

// ------------------------------
// Login handler
// ------------------------------
function loginUser() {
    authContainer.classList.add("hidden");
    authWhenLoggedIn.classList.remove("hidden");
    whoami.textContent = currentUser.username;

    summarySection.classList.remove("hidden");
    marketSection.classList.remove("hidden");

    // Admin panel visibility
    if (currentUser.role === "admin") {
        adminPanel.classList.remove("hidden");
        btnTick.classList.remove("hidden");
    } else {
        adminPanel.classList.add("hidden");
        btnTick.classList.add("hidden");
    }

    renderPortfolio();
    renderMarket();
}

// ------------------------------
// Render Portfolio
// ------------------------------
function renderPortfolio() {
    document.getElementById("cash").textContent = `$${currentUser.cash.toFixed(2)}`;
    let invested = currentUser.holdings.reduce((sum, h) => {
        const s = stocks.find(st => st.symbol === h.symbol);
        return sum + (s ? s.price * h.qty : 0);
    }, 0);
    document.getElementById("invested").textContent = `$${invested.toFixed(2)}`;
    document.getElementById("currentValue").textContent = `$${invested.toFixed(2)}`;
    let pl = invested - (100000 - currentUser.cash);
    let plSpan = document.getElementById("pl");
    plSpan.textContent = `$${pl.toFixed(2)}`;
    plSpan.className = pl >= 0 ? "font-bold good" : "font-bold bad";

    const holdingsList = document.getElementById("holdingsList");
    holdingsList.innerHTML = currentUser.holdings.map(h => {
        const s = stocks.find(st => st.symbol === h.symbol);
        return `<div class='holding-item p-2 flex justify-between'><span>${s.symbol}</span><span>${h.qty} shares</span></div>`;
    }).join('');
}

// ------------------------------
// Render Market
// ------------------------------
function renderMarket() {
    const marketDiv = document.getElementById("market");
    marketDiv.innerHTML = stocks.map(s => {
        return `<div class='card p-4 flex flex-col justify-between'><h3 class='font-bold'>${s.symbol} - ${s.name}</h3><p class='price'>$${s.price.toFixed(2)}</p><button class='btn bg-indigo-500 text-white mt-2 py-1 rounded trade-btn' data-symbol='${s.symbol}'>Trade</button></div>`;
    }).join('');

    document.querySelectorAll('.trade-btn').forEach(btn => {
        btn.addEventListener('click', () => openTrade(btn.dataset.symbol));
    });
}

// ------------------------------
// Trade modal
// ------------------------------
function openTrade(symbol) {
    const stock = stocks.find(s => s.symbol === symbol);
    if (!stock) return;
    tradeTitle.textContent = `${stock.name} (${stock.symbol})`;
    tradePrice.textContent = `Current Price: $${stock.price.toFixed(2)}`;
    qtyInput.value = 1;
    tradeMsg.textContent = '';
    tradeModal.showModal();

    buyBtn.onclick = () => {
        let qty = parseInt(qtyInput.value);
        if (qty <= 0 || qty > currentUser.cash / stock.price) {
            tradeMsg.textContent = 'Invalid quantity or insufficient cash';
            return;
        }
        let h = currentUser.holdings.find(h => h.symbol === stock.symbol);
        if (h) h.qty += qty;
        else currentUser.holdings.push({ symbol: stock.symbol, qty });
        currentUser.cash -= stock.price * qty;
        saveUsers();
        renderPortfolio();
        tradeModal.close();
    };

    sellBtn.onclick = () => {
        let qty = parseInt(qtyInput.value);
        let h = currentUser.holdings.find(h => h.symbol === stock.symbol);
        if (!h || qty <= 0 || qty > h.qty) {
            tradeMsg.textContent = 'Invalid quantity or not enough shares';
            return;
        }
        h.qty -= qty;
        if (h.qty === 0) currentUser.holdings = currentUser.holdings.filter(x => x.qty > 0);
        currentUser.cash += stock.price * qty;
        saveUsers();
        renderPortfolio();
        tradeModal.close();
    };
}

cancelBtn.onclick = () => tradeModal.close();

// ------------------------------
// Admin: user management
// ------------------------------
btnCreateUser.addEventListener('click', () => {
    const username = adminUserEmail.value.trim();
    const password = adminUserPassword.value.trim();
    if (!username || !password) return adminUserMsg.textContent = 'Enter username and password';
    if (users.find(u => u.username === username)) return adminUserMsg.textContent = 'User already exists';
    users.push({ username, password, role:'user', cash:100000, holdings:[] });
    saveUsers();
    adminUserMsg.textContent = `User ${username} created!`;
});

btnChangePassword.addEventListener('click', () => {
    const username = adminUserEmail.value.trim();
    const password = adminUserPassword.value.trim();
    const user = users.find(u => u.username === username);
    if (!user) return adminUserMsg.textContent = 'User not found';
    user.password = password;
    saveUsers();
    adminUserMsg.textContent = `Password for ${username} changed!`;
});

btnDeleteUser.addEventListener('click', () => {
    const username = adminUserEmail.value.trim();
    const index = users.findIndex(u => u.username === username);
    if (index === -1) return adminUserMsg.textContent = 'User not found';
    if (users[index].role === 'admin') return adminUserMsg.textContent = 'Cannot delete Admin';
    users.splice(index,1);
    saveUsers();
    adminUserMsg.textContent = `User ${username} deleted!`;
});

btnViewAnalytics.addEventListener('click', () => {
    analyticsOutput.innerHTML = users.map(u => `<p>${u.username} - Role: ${u.role} - Cash: $${u.cash.toFixed(2)} - Holdings: ${u.holdings.map(h => h.symbol+':'+h.qty).join(', ')}</p>`).join('');
});

// ------------------------------
// Market tick (Admin only)
// ------------------------------
btnTick.addEventListener('click', () => {
    stocks.forEach(s => {
        let change = (Math.random() - 0.5) * 10; // random -5 to +5
        s.price = Math.max(1, s.price + change);
    });
    saveStocks();
    renderMarket();
    if(currentUser) renderPortfolio();
});

// ------------------------------
// Save / load helpers
// ------------------------------
function saveUsers() {
    localStorage.setItem('users', JSON.stringify(users));
}

function saveStocks() {
    localStorage.setItem('stocks', JSON.stringify(stocks));
}
