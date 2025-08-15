// --- Firebase SDKs (modular, via ESM CDN) ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, signInAnonymously, signOut,
  // Removed GoogleAuthProvider, signInWithPopup as Google login is removed
  deleteUser, updatePassword // Keep these for admin panel placeholders
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { 
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction,
  collection, getDocs, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

// --- Firebase Configuration (from firebase-config.js) ---
import { firebaseConfig } from './firebase-config.js'; // Ensure this path is correct

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- DOM Element References ---
const $ = id => document.getElementById(id);

// Auth related elements
const authContainer = $('auth-container');
const authCard = $('auth-card');
const usernameInput = $('username-input'); // Renamed from email
const passwordInput = $('password-input'); // Renamed from password
const btnLogin = $('btn-login');
const btnSignup = $('btn-signup');
const btnGuest = $('btn-guest');
const authMsg = $('authMsg');
const whoami = $('whoami');
const authWhenLoggedIn = $('auth-when-logged-in');
const btnLogout = $('btn-logout');
const themeBtn = $('theme');

// Role selection elements
const roleSelectionContainer = $('role-selection-container');
const roleTraderBtn = $('role-trader');
const roleViewerBtn = $('role-viewer');

// Main app sections
const summarySection = $('summary');
const marketSection = $('market-section');
const adminPanel = $('admin-panel');

// Portfolio elements
const cashElement = $('cash');
const investedElement = $('invested');
const currentValueElement = $('currentValue');
const plElement = $('pl');
const holdingsListElement = $('holdingsList');
const holdingsHeaderElement = $('holdings-header'); // New element for holdings title
const watchlistListElement = $('watchlistList');
const watchlistHeaderElement = $('watchlist-header');

// Market elements
const categoryFilter = $('categoryFilter');
const searchInput = $('search');
const marketMeta = $('marketMeta');
const marketGrid = $('market');

// Admin controls
const btnTickMarket = $('btn-tick');
const adminUserEmail = $('admin-user-email');
const adminUserPassword = $('admin-user-password');
const btnCreateUser = $('admin-create-user');
const btnChangePassword = $('admin-change-password');
const btnDeleteUser = $('admin-delete-user');
const adminUserMsg = $('admin-user-msg');
const btnViewAnalytics = $('admin-view-analytics');
const analyticsOutput = $('analytics-output');

// Trade modal elements
const tradeModal = $('trade');
const tradeTitle = $('tradeTitle');
const tradePrice = $('tradePrice');
const qtyInput = $('qty');
const btnBuy = $('buy');
const btnSell = $('sell');
const btnCancelTrade = $('cancel');
const tradeMsg = $('tradeMsg');

// --- Global Application State ---
let user = null; // Firebase Auth user object
let market = { stocks: [] }; // Global market data
let portfolio = null; // Current user's portfolio data from Firestore
let currentUserRole = null; // 'trader' or 'viewer' or 'admin'

const START_CASH = 100000; // Initial cash balance for new users

// Admin credentials (for client-side check - NOT SECURE FOR PRODUCTION)
const ADMIN_USERNAME = "Admin@ashoka.edu"; // Use an email format for Firebase Auth
const ADMIN_PASSWORD = "Admin_123";

// --- Helper Functions ---
const fmt = n => '₹' + (Number(n || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// --- Authentication Event Handlers ---
btnLogin.onclick = async () => {
  try {
    const username = usernameInput.value.trim(); 
    const password = passwordInput.value.trim();
    
    // IMPORTANT: Firebase signInWithEmailAndPassword expects an email format for 'username'.
    // If you need true arbitrary usernames, a custom backend (Firebase Cloud Functions)
    // to map usernames to emails is required for secure authentication.
    const userCredential = await signInWithEmailAndPassword(auth, username, password);
    
    authMsg.textContent = ''; // Clear any previous error messages

    // Client-side admin check (NOT SECURE FOR PRODUCTION)
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      displayAdminPanel(true);
      $('whoami').textContent = `Admin User: ${userCredential.user.email || 'Admin'}`;
    } else {
      // For regular users, show role selection
      displayRoleSelection();
    }
  } catch (e) {
    authMsg.textContent = `Login failed: ${e.message}`;
    authMsg.style.color = 'red';
  }
};

btnSignup.onclick = async () => {
  try {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) {
        authMsg.textContent = 'Please enter a username (email) and password.';
        authMsg.style.color = 'red';
        return;
    }
    // Firebase still expects an email format for signup.
    await createUserWithEmailAndPassword(auth, username, password);
    authMsg.textContent = 'Account created! Please log in with your username.';
    authMsg.style.color = 'green';
  } catch (e) {
    authMsg.textContent = `Signup failed: ${e.message}`;
    authMsg.style.color = 'red';
  }
};

btnGuest.onclick = async () => {
  try {
    await signInAnonymously(auth);
    displayRoleSelection(); // Guests also choose a role
    authMsg.textContent = '';
  } catch (e) {
    authMsg.textContent = `Guest login failed: ${e.message}`;
    authMsg.style.color = 'red';
  }
};

btnLogout.onclick = async () => {
  await signOut(auth);
  // UI visibility will be handled by onAuthStateChanged
};

// --- Role Selection Handlers ---
roleTraderBtn.onclick = () => selectRole('trader');
roleViewerBtn.onclick = () => selectRole('viewer');

async function selectRole(role) {
    currentUserRole = role;
    // Persist the selected role in the user's Firestore document
    if (user && user.uid) {
        const uref = doc(db, 'users', user.uid);
        await updateDoc(uref, {
            lastSelectedRole: role
        }).catch(e => console.error("Error saving user role:", e));
    }
    displayMainAppUI(role); // Transition to main app UI
}

// --- UI Visibility Control Functions ---
function displayAdminPanel(isAdmin) {
  if (isAdmin) {
    currentUserRole = 'admin'; // Set current role to admin
    adminPanel.classList.remove('hidden');
    summarySection.classList.add('hidden'); // Hide regular sections
    marketSection.classList.add('hidden');
    authContainer.classList.add('hidden');
    roleSelectionContainer.classList.add('hidden');
    btnTickMarket.classList.remove('hidden'); // Show admin tick button
  } else {
    adminPanel.classList.add('hidden');
    btnTickMarket.classList.add('hidden'); // Hide admin tick button
  }
}

function displayRoleSelection() {
    authContainer.classList.add('hidden'); // Hide login form
    roleSelectionContainer.classList.remove('hidden'); // Show role selection
    adminPanel.classList.add('hidden'); // Ensure admin panel is hidden
    summarySection.classList.add('hidden'); // Hide main app content
    marketSection.classList.add('hidden');
}

function displayMainAppUI(role) {
    authContainer.classList.add('hidden'); // Hide login form
    roleSelectionContainer.classList.add('hidden'); // Hide role selection
    adminPanel.classList.add('hidden'); // Ensure admin panel is hidden

    // Show regular user elements
    summarySection.classList.remove('hidden');
    marketSection.classList.remove('hidden');

    // Adjust specific UI elements based on role
    if (role === 'trader') {
        investedElement.parentElement.classList.remove('hidden');
        currentValueElement.parentElement.classList.remove('hidden');
        plElement.parentElement.classList.remove('hidden');
        holdingsHeaderElement.classList.remove('hidden');
        holdingsListElement.innerHTML = '<p class="text-gray-500 italic">Loading holdings...</p>'; // Placeholder
        watchlistHeaderElement.classList.add('hidden');
        watchlistListElement.innerHTML = '';
    } else if (role === 'viewer') {
        investedElement.parentElement.classList.add('hidden');
        currentValueElement.parentElement.classList.add('hidden');
        plElement.parentElement.classList.add('hidden');
        holdingsHeaderElement.classList.add('hidden'); // Viewers don't have holdings
        holdingsListElement.innerHTML = '';
        watchlistHeaderElement.classList.remove('hidden');
        watchlistListElement.innerHTML = '<p class="text-gray-500 italic">Loading watchlist...</p>'; // Placeholder
    }
    
    renderMarket(); // Render market cards with appropriate buttons (trade vs watchlist)
    renderSummary(); // Render portfolio/watchlist based on selected role
}

// --- Firebase Authentication State Listener ---
onAuthStateChanged(auth, async (u) => {
  user = u;
  authMsg.textContent = ''; // Clear auth messages on state change

  if (!u) {
    // User logged out
    authWhenLoggedIn.classList.add('hidden');
    authContainer.classList.remove('hidden'); // Show login form
    roleSelectionContainer.classList.add('hidden'); // Hide role selection
    displayAdminPanel(false); // Ensure admin panel is hidden
    summarySection.classList.add('hidden'); // Hide main app content
    marketSection.classList.add('hidden');
    currentUserRole = null; // Reset role
    whoami.textContent = ''; // Clear username display
    return;
  }

  // User logged in or state changed (e.g., page refresh)
  authWhenLoggedIn.classList.remove('hidden');
  whoami.textContent = `Logged in as: ${u.email || 'Guest User'}`;

  // Admin check (client-side)
  if (u.email === ADMIN_USERNAME) { // Check against the defined admin username
    displayAdminPanel(true);
  } else {
    // Ensure user document exists (important for new sign-ups or guest users)
    await ensureUserDoc(u.uid);
    // Subscribe to portfolio and market data
    subscribePortfolio(u.uid);
    subscribeMarket();

    // Check if user previously selected a role and resume it, otherwise show role selection
    const userDocRef = doc(db, 'users', u.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists() && userDocSnap.data().lastSelectedRole) {
        selectRole(userDocSnap.data().lastSelectedRole); // Resume previous role
    } else {
        displayRoleSelection(); // Prompt for role selection
    }
  }
});

// --- Firestore Data Subscriptions ---
async function ensureUserDoc(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      createdAt: Date.now(),
      cashBalance: START_CASH,
      holdings: [],
      transactions: [],
      watchlist: [] // Initialize watchlist for all users
    });
  }
}

function subscribePortfolio(uid) {
  const ref = doc(db, 'users', uid);
  // onSnapshot provides real-time updates for portfolio data
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
        portfolio = snap.data();
        // Only render summary if a role is already selected
        if (currentUserRole) {
            renderSummary();
        }
    } else {
        console.warn("User portfolio document does not exist:", uid);
        portfolio = null; // Reset portfolio
        renderSummary(); // Render with empty data
    }
  }, (error) => {
    console.error("Error subscribing to portfolio:", error);
    // Handle error, e.g., display a message to the user
  });
}

function subscribeMarket() {
  const ref = doc(db, 'market', 'state');
  // onSnapshot provides real-time updates for market data
  onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      market = snap.data();
      // Render market and portfolio (as prices affect portfolio values)
      if (currentUserRole) { // Only render if a role is selected
        renderMarket(); 
        renderSummary(); // Re-render summary to update values based on new prices
      }
    } else {
        console.warn("Market data not found in Firestore.");
        market = { stocks: [] }; // Reset market data
        marketMeta.textContent = "Market data unavailable. (Admin needs to initialize)";
    }
  }, (error) => {
    console.error("Error subscribing to market:", error);
    marketMeta.textContent = "Error fetching market data.";
  });
}

// --- UI Rendering Functions ---
function renderSummary() {
  if (!portfolio || !currentUserRole) return; // Don't render if no portfolio or role

  cashElement.textContent = fmt(portfolio.cashBalance);

  if (currentUserRole === 'trader') {
    // Show full portfolio for traders
    investedElement.parentElement.classList.remove('hidden');
    currentValueElement.parentElement.classList.remove('hidden');
    plElement.parentElement.classList.remove('hidden');
    holdingsHeaderElement.classList.remove('hidden');
    watchlistHeaderElement.classList.add('hidden'); // No separate watchlist header for traders

    const map = Object.fromEntries(market.stocks.map(s => [s.id, s.price]));
    let invested = 0, current = 0;
    for (const h of (portfolio.holdings || [])) {
      invested += (h.avg || 0) * h.qty;
      current += (map[h.id] || 0) * h.qty;
    }
    investedElement.textContent = fmt(invested);
    currentValueElement.textContent = fmt(current);
    const pl = current + portfolio.cashBalance - START_CASH;
    plElement.textContent = fmt(pl);
    if (pl >= 0) { plElement.classList.remove('bad'); plElement.classList.add('good'); }
    else { plElement.classList.remove('good'); plElement.classList.add('bad'); }

    // Render holdings list
    holdingsListElement.innerHTML = '';
    if (portfolio.holdings && portfolio.holdings.length > 0) {
      for (const h of portfolio.holdings) {
        const stock = market.stocks.find(s => s.id === h.id);
        if (stock) {
          const holdingItem = document.createElement('div');
          holdingItem.className = 'flex justify-between items-center holding-item';
          holdingItem.innerHTML = `
            <span>${stock.symbol} (${stock.name}): <span class="font-bold">${h.qty}</span> shares</span>
            <span class="text-sm text-gray-600 dark:text-gray-300">Avg Cost: ${fmt(h.avg)}</span>
          `;
          holdingsListElement.appendChild(holdingItem);
        }
      }
    } else {
      holdingsListElement.innerHTML = '<p class="text-gray-500 italic dark:text-gray-400">No holdings yet. Start trading!</p>';
    }
    watchlistListElement.innerHTML = ''; // Clear viewer-specific elements

  } else if (currentUserRole === 'viewer') {
    // Hide trading-specific portfolio parts for viewers
    investedElement.parentElement.classList.add('hidden');
    currentValueElement.parentElement.classList.add('hidden');
    plElement.parentElement.classList.add('hidden');
    holdingsHeaderElement.classList.add('hidden'); 
    holdingsListElement.innerHTML = ''; // Clear holdings list
    watchlistHeaderElement.classList.remove('hidden');

    // Render watchlist
    watchlistListElement.innerHTML = '';
    if (portfolio.watchlist && portfolio.watchlist.length > 0) {
        const map = Object.fromEntries(market.stocks.map(s => [s.id, s.price]));
        for (const stockId of portfolio.watchlist) {
            const stock = market.stocks.find(s => s.id === stockId);
            if (stock) {
                const watchlistItem = document.createElement('div');
                watchlistItem.className = 'flex justify-between items-center holding-item';
                watchlistItem.innerHTML = `
                    <span class="font-bold">${stock.symbol}</span> <span>${stock.name}</span>
                    <span class="text-lg font-semibold">${fmt(stock.price)}</span>
                `;
                watchlistListElement.appendChild(watchlistItem);
            }
        }
    } else {
        watchlistListElement.innerHTML = '<p class="text-gray-500 italic dark:text-gray-400">Your watchlist is empty. Add stocks from the market!</p>';
    }
  }
}

function renderMarket() {
  if (!market?.stocks?.length) {
    marketGrid.innerHTML = '<p class="text-center text-gray-500 col-span-full dark:text-gray-400">No market data available.</p>';
    return;
  }
  
  // Populate category filter
  const categories = ['All', ...new Set(market.stocks.map(s => s.category))];
  categoryFilter.innerHTML = '';
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categoryFilter.appendChild(option);
  });
  // Ensure the selected category persists visually
  if (categoryFilter.value !== activeCategory) {
      categoryFilter.value = activeCategory;
  }
  categoryFilter.onchange = () => {
    activeCategory = categoryFilter.value;
    renderCards(activeCategory === 'All' ? null : activeCategory);
  };

  // Update market meta (last updated time)
  const lastUpdated = market.updatedAt ? new Date(market.updatedAt).toLocaleString() : 'N/A';
  marketMeta.textContent = `Last updated: ${lastUpdated}`;

  // Re-render cards based on current filters/role
  renderCards(categoryFilter.value === 'All' ? null : categoryFilter.value);
}

// Global variables for filtering
let activeCategory = 'All';
let searchTerm = '';

// Event listener for search input
searchInput.oninput = () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    renderCards(activeCategory === 'All' ? null : activeCategory);
};

function renderCards(category = null) {
  let list = category ? market.stocks.filter(s => s.category === category) : market.stocks;
  
  // Apply search filter if active
  if (searchTerm) {
    list = list.filter(s => 
      s.name.toLowerCase().includes(searchTerm) || 
      s.symbol.toLowerCase().includes(searchTerm) ||
      (s.category && s.category.toLowerCase().includes(searchTerm))
    );
  }

  marketGrid.innerHTML = '';
  if (list.length === 0) {
    marketGrid.innerHTML = '<p class="text-center text-gray-500 col-span-full dark:text-gray-400">No stocks found matching your criteria.</p>';
    return;
  }

  for (const s of list) {
    const card = document.createElement('div');
    card.className = 'card'; // Tailwind classes from inline style
    const change = (s.price - s.prevClose);
    const changePct = s.prevClose ? (change / s.prevClose * 100).toFixed(2) : '0.00';
    const changeCls = change >= 0 ? 'good' : 'bad'; // Tailwind class for color
    const changeArrow = change >= 0 ? '▲' : '▼';

    let actionButtonHtml = '';
    const isOnWatchlist = portfolio?.watchlist?.includes(s.id); // Check if stock is on watchlist

    if (currentUserRole === 'trader') {
        actionButtonHtml = `<button class="btn btn-accent" data-id="${s.id}" data-action="trade">Trade</button>`;
    } else if (currentUserRole === 'viewer') {
        if (isOnWatchlist) {
            actionButtonHtml = `<button class="btn watchlist-btn-remove" data-id="${s.id}" data-action="remove-watchlist">Remove from Watchlist</button>`;
        } else {
            actionButtonHtml = `<button class="btn watchlist-btn-add" data-id="${s.id}" data-action="add-watchlist">Add to Watchlist</button>`;
        }
    }

    card.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <div class="name">${s.name}</div>
          <div class="category-pill">${s.symbol}</div>
        </div>
        <div class="text-right">
          <div class="price">${fmt(s.price)}</div>
          <div class="${changeCls}">${changeArrow} ${Math.abs(change).toFixed(2)} (${Math.abs(changePct)}%)</div>
        </div>
      </div>
      <div class="flex gap-4 pt-2">
        ${actionButtonHtml}
      </div>
    `;
    marketGrid.appendChild(card);
  }

  // Attach event listeners for dynamically created buttons
  marketGrid.querySelectorAll('button[data-action]').forEach(btn => {
    const stockId = btn.dataset.id;
    const action = btn.dataset.action;
    
    if (action === 'trade') {
        btn.onclick = () => openTrade(stockId);
    } else if (action === 'add-watchlist') {
        btn.onclick = () => addToWatchlist(stockId);
    } else if (action === 'remove-watchlist') {
        btn.onclick = () => removeFromWatchlist(stockId);
    }
  });
}


// --- Watchlist Functions ---
async function addToWatchlist(stockId) {
    if (!user || !user.uid) {
        authMsg.textContent = 'Please log in to manage your watchlist.';
        authMsg.style.color = 'red';
        return;
    }
    try {
        const uref = doc(db, 'users', user.uid);
        await updateDoc(uref, {
            watchlist: arrayUnion(stockId)
        });
        // UI will update automatically via onSnapshot for portfolio
        console.log(`Added ${stockId} to watchlist.`);
    } catch (e) {
        console.error("Error adding to watchlist:", e);
        authMsg.textContent = `Error adding to watchlist: ${e.message}`;
        authMsg.style.color = 'red';
    }
}

async function removeFromWatchlist(stockId) {
    if (!user || !user.uid) {
        authMsg.textContent = 'Please log in to manage your watchlist.';
        authMsg.style.color = 'red';
        return;
    }
    try {
        const uref = doc(db, 'users', user.uid);
        await updateDoc(uref, {
            watchlist: arrayRemove(stockId)
        });
        // UI will update automatically via onSnapshot for portfolio
        console.log(`Removed ${stockId} from watchlist.`);
    } catch (e) {
        console.error("Error removing from watchlist:", e);
        authMsg.textContent = `Error removing from watchlist: ${e.message}`;
        authMsg.style.color = 'red';
    }
}

// --- Trading Functions ---
let tradeStock = null; // The stock currently selected for trading
function openTrade(id) {
  tradeStock = market.stocks.find(s => s.id === id);
  if (!tradeStock) {
      tradeMsg.textContent = "Stock not found.";
      tradeMsg.style.color = 'red';
      return;
  }
  tradeTitle.textContent = `${tradeStock.name} (${tradeStock.symbol})`;
  tradePrice.textContent = `Current Price: ${fmt(tradeStock.price)}`;
  qtyInput.value = 1;
  tradeMsg.textContent = ''; // Clear previous messages
  tradeModal.showModal();
}

btnCancelTrade.onclick = () => tradeModal.close();
btnBuy.onclick = () => doTrade('BUY');
btnSell.onclick = () => doTrade('SELL');

async function doTrade(side) {
  try {
    const qty = Math.max(1, Number(qtyInput.value || 1));
    if (qty <= 0) throw new Error('Quantity must be at least 1.');

    const px = tradeStock.price; // Current price of the stock
    const uid = user.uid;

    await runTransaction(db, async (tx) => {
      const uref = doc(db, 'users', uid);
      const usnap = await tx.get(uref);
      if (!usnap.exists()) throw new Error("User portfolio not found.");
      
      const u = usnap.data();
      let cash = u.cashBalance;
      const holdings = [...(u.holdings || [])]; // Make a mutable copy
      const transactionCost = Number((px * qty).toFixed(2));

      if (side === 'BUY') {
        if (cash < transactionCost) throw new Error('Insufficient cash balance.');
        cash -= transactionCost;
        const holdingIndex = holdings.findIndex(h => h.id === tradeStock.id);
        if (holdingIndex >= 0) {
          const existingHolding = holdings[holdingIndex];
          const newQuantity = existingHolding.qty + qty;
          const newAverageCost = ((existingHolding.avg * existingHolding.qty) + transactionCost) / newQuantity;
          holdings[holdingIndex] = { id: existingHolding.id, qty: newQuantity, avg: Number(newAverageCost.toFixed(2)) };
        } else {
          holdings.push({ id: tradeStock.id, qty, avg: px });
        }
      } else { // SELL
        const holdingIndex = holdings.findIndex(h => h.id === tradeStock.id);
        if (holdingIndex < 0 || holdings[holdingIndex].qty < qty) throw new Error('Not enough shares to sell.');
        
        const existingHolding = holdings[holdingIndex];
        const newQuantity = existingHolding.qty - qty;
        if (newQuantity === 0) { 
          holdings.splice(holdingIndex, 1); // Remove holding if quantity is zero
        } else { 
          holdings[holdingIndex] = { ...existingHolding, qty: newQuantity }; 
        }
        cash += transactionCost; // Add sale proceeds to cash
      }

      const transactions = [...(u.transactions || [])]; // Make a mutable copy
      transactions.push({ 
          ts: Date.now(), 
          stockId: tradeStock.id, 
          symbol: tradeStock.symbol,
          side, 
          qty, 
          price: px 
      });

      // Update the user's document within the transaction
      tx.update(uref, { 
          cashBalance: Number(cash.toFixed(2)), 
          holdings: holdings, 
          transactions: transactions 
      });
    });

    tradeMsg.textContent = `Trade successful: ${side} ${qty} shares of ${tradeStock.symbol}!`;
    tradeMsg.style.color = 'green';
    setTimeout(() => tradeModal.close(), 1000); // Close modal after success
  } catch (e) {
    tradeMsg.textContent = `Trade failed: ${e.message}`;
    tradeMsg.style.color = 'red';
  }
}


// --- Theme Toggle ---
themeBtn.onclick = () => document.body.classList.toggle('dark');

// --- Admin Panel Functions (Client-side - NOT SECURE FOR PRODUCTION) ---
// Note: These functions are for demonstration purposes and are client-side.
// For a production application, user management (create, change password, delete)
// should be handled securely via Firebase Admin SDK on a backend (e.g., Cloud Functions).
btnCreateUser.onclick = async () => {
  const email = adminUserEmail.value.trim(); // Still expects email for Firebase Auth
  const password = adminUserPassword.value.trim();
  const msgElement = adminUserMsg;
  if (!email || !password) {
    msgElement.textContent = 'Email and Password are required to create a user.';
    msgElement.style.color = 'red';
    return;
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await ensureUserDoc(userCredential.user.uid); // Create user's Firestore document
    msgElement.textContent = `User ${email} created successfully! UID: ${userCredential.user.uid}`;
    msgElement.style.color = 'green';
    adminUserEmail.value = '';
    adminUserPassword.value = '';
  } catch (e) {
    msgElement.textContent = `Error creating user: ${e.message}`;
    msgElement.style.color = 'red';
  }
};

btnChangePassword.onclick = async () => {
  const email = adminUserEmail.value.trim();
  const newPassword = adminUserPassword.value.trim();
  const msgElement = adminUserMsg;
  if (!email || !newPassword) {
    msgElement.textContent = 'Email and New Password are required to change password.';
    msgElement.style.color = 'red';
    return;
  }
  
  msgElement.textContent = 'Password change for other users requires Firebase Admin SDK on a backend.';
  msgElement.style.color = 'orange';
};

btnDeleteUser.onclick = async () => {
  const emailToDelete = adminUserEmail.value.trim();
  const msgElement = adminUserMsg;
  if (!emailToDelete) {
    msgElement.textContent = 'Email is required to delete a user.';
    msgElement.style.color = 'red';
    return;
  }

  msgElement.textContent = 'User deletion for other users requires Firebase Admin SDK on a backend.';
  msgElement.style.color = 'orange';
};

btnViewAnalytics.onclick = async () => {
  analyticsOutput.innerHTML = '<p class="text-gray-500 dark:text-gray-400">Fetching user data...</p>';
  try {
    const usersColRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersColRef);
    
    let analyticsHtml = '<ul class="divide-y divide-gray-200 dark:divide-gray-600">';
    if (querySnapshot.empty) {
        analyticsHtml += '<p class="text-gray-500 italic dark:text-gray-400">No user data found.</p>';
    } else {
        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            const userId = doc.id;
            analyticsHtml += `
                <li class="py-4 px-3 border-b last:border-b-0">
                    <p class="font-semibold text-blue-700 dark:text-blue-400">User ID: <span class="text-blue-500 dark:text-blue-300 break-words">${userId}</span></p>
                    <p class="text-gray-700 dark:text-gray-200">Cash Balance: <span class="font-medium">${fmt(userData.cashBalance)}</span></p>
                    <p class="text-gray-700 dark:text-gray-200">Holdings: <span class="font-mono text-xs break-words">${JSON.stringify(userData.holdings || [])}</span></p>
                    <p class="text-gray-700 dark:text-gray-200">Transactions: <span class="font-mono text-xs break-words">${JSON.stringify(userData.transactions || [])}</span></p>
                    <p class="text-gray-700 dark:text-gray-200">Watchlist: <span class="font-mono text-xs break-words">${JSON.stringify(userData.watchlist || [])}</span></p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Created At: ${new Date(userData.createdAt).toLocaleString()}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Last Role: ${userData.lastSelectedRole || 'N/A'}</p>
                </li>
            `;
        });
    }
    analyticsHtml += '</ul>';
    analyticsOutput.innerHTML = analyticsHtml;
  } catch (e) {
    analyticsOutput.innerHTML = `<p class="text-red-500 dark:text-red-400">Error fetching analytics: ${e.message}</p>`;
  }
};

// --- Admin Market Tick ---
btnTickMarket.onclick = async () => {
  try {
    const ref = doc(db, "market", "state");
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        marketMeta.textContent = "Market data not found! Cannot tick.";
        marketMeta.style.color = 'red';
        return;
    }

    const data = snap.data();
    const stocks = data.stocks.map(stock => {
        const changePercent = (Math.random() * 4 - 2) / 100; // -2% to +2%
        const newPrice = +(stock.price * (1 + changePercent)).toFixed(2);
        return {
            ...stock,
            prevClose: stock.price,
            price: newPrice
        };
    });

    await setDoc(ref, {
        ...data,
        stocks,
        updatedAt: Date.now()
    });

    marketMeta.textContent = "✅ Market prices updated!";
    marketMeta.style.color = 'green';
    setTimeout(() => {
        marketMeta.textContent = `Last updated: ${new Date(Date.now()).toLocaleString()}`;
        marketMeta.style.color = ''; // Reset color
    }, 2000);
  } catch (e) {
    marketMeta.textContent = `Error ticking market: ${e.message}`;
    marketMeta.style.color = 'red';
  }
};

// Initial setup to hide unnecessary elements on load if user is not authenticated
// This is already implicitly handled by onAuthStateChanged when user is null initially.
