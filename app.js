import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, signInAnonymously, signOut,
  deleteUser, updatePassword, updateEmail 
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { 
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction,
  collection, getDocs, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM helpers
const $ = id => document.getElementById(id);
const fmt = n => '₹' + (Number(n || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 });

let user = null;
let market = { stocks: [] };
let portfolio = null;
let currentUserRole = null; // 'trader' or 'viewer'

const START_CASH = 100000;

// Admin credentials (for client-side check - NOT SECURE FOR PRODUCTION)
const ADMIN_EMAIL = "Admin"; // This will now be treated as a "username"
const ADMIN_PASSWORD = "Admin_123";

// UI Elements
const regularUserElements = [$('summary'), $('market-section')];
const adminPanel = $('admin-panel');
const authContainer = $('auth-container');
const roleSelectionContainer = $('role-selection-container');
const loginForm = $('login-form'); // The div containing username/password inputs and buttons

// --- AUTHENTICATION EVENTS ---
$('btn-login').onclick = async () => {
  try {
    const username = $('username-input').value.trim(); 
    const password = $('password-input').value.trim();
    const userCredential = await signInWithEmailAndPassword(auth, username, password);
    
    // Client-side admin check (NOT SECURE FOR PRODUCTION)
    if (username === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      displayAdminPanel(true);
      $('whoami').textContent = `Admin User: ${userCredential.user.email || 'Admin'}`;
    } else {
      displayRoleSelection(); // Show role selection for regular users
    }
    $('authMsg').textContent = ''; // Clear any previous auth messages
  } catch (e) {
    $('authMsg').textContent = `Error: ${e.message}`;
    $('authMsg').style.color = 'red';
  }
};

$('btn-signup').onclick = async () => {
  try {
    const username = $('username-input').value.trim();
    const password = $('password-input').value.trim();
    await createUserWithEmailAndPassword(auth, username, password);
    $('authMsg').textContent = 'Account created! Please log in with your username.';
    $('authMsg').style.color = 'green';
  } catch (e) {
    $('authMsg').textContent = `Error: ${e.message}`;
    $('authMsg').style.color = 'red';
  }
};

$('btn-guest').onclick = async () => {
  try {
    await signInAnonymously(auth);
    displayRoleSelection(); // Guests also choose a role
    $('authMsg').textContent = '';
  } catch (e) {
    $('authMsg').textContent = `Error: ${e.message}`;
    $('authMsg').style.color = 'red';
  }
};

$('btn-logout').onclick = async () => {
  await signOut(auth);
  // UI visibility handled by onAuthStateChanged
};

// --- ROLE SELECTION ---
$('role-trader').onclick = () => selectRole('trader');
$('role-viewer').onclick = () => selectRole('viewer');

function displayRoleSelection() {
    authContainer.classList.add('hidden'); // Hide login form
    roleSelectionContainer.classList.remove('hidden'); // Show role selection
    adminPanel.classList.add('hidden'); // Ensure admin panel is hidden
    regularUserElements.forEach(el => el.classList.add('hidden')); // Hide main app content
}

async function selectRole(role) {
    currentUserRole = role;
    // Save the role in the user's Firestore document (optional, but good for persistence)
    if (user && user.uid) {
        const uref = doc(db, 'users', user.uid);
        await updateDoc(uref, {
            lastSelectedRole: role
        }).catch(e => console.error("Error saving user role:", e));
    }

    roleSelectionContainer.classList.add('hidden'); // Hide role selection
    displayMainAppUI(role); // Show main app content based on role
}

// --- UI VISIBILITY FUNCTIONS ---
function displayAdminPanel(isAdmin) {
  if (isAdmin) {
    adminPanel.classList.remove('hidden');
    regularUserElements.forEach(el => el.classList.add('hidden'));
    authContainer.classList.add('hidden');
    roleSelectionContainer.classList.add('hidden');
    $('btn-tick').classList.remove('hidden'); // Show admin tick button
  } else {
    adminPanel.classList.add('hidden');
    $('btn-tick').classList.add('hidden'); // Hide admin tick button
  }
}

function displayMainAppUI(role) {
    authContainer.classList.add('hidden'); // Hide login form
    roleSelectionContainer.classList.add('hidden'); // Hide role selection
    adminPanel.classList.add('hidden'); // Ensure admin panel is hidden

    // Show regular user elements
    regularUserElements.forEach(el => el.classList.remove('hidden'));

    // Adjust specific UI elements based on role
    if (role === 'trader') {
        $('summary').classList.remove('hidden'); // Traders see full portfolio summary
        $('watchlist-header').classList.add('hidden'); // No separate watchlist header for traders (it's part of holdings)
    } else if (role === 'viewer') {
        $('summary').classList.remove('hidden'); // Viewers also see portfolio summary (but only cash/watchlist)
        // Adjust the portfolio summary for viewers
        $('invested').parentElement.classList.add('hidden');
        $('currentValue').parentElement.classList.add('hidden');
        $('pl').parentElement.classList.add('hidden');
        $('holdingsList').innerHTML = '<p class="text-gray-500 italic">Viewers do not have holdings.</p>';
        $('watchlist-header').classList.remove('hidden'); // Show watchlist header
    }
    
    // Render market cards with appropriate buttons (trade vs watchlist)
    renderMarket(); 
}

// --- AUTH STATE CHANGE LISTENER ---
onAuthStateChanged(auth, async (u) => {
  user = u;
  $('authMsg').textContent = ''; // Clear auth messages on state change

  if (!u) {
    // User logged out
    $('auth-when-logged-in').classList.add('hidden');
    authContainer.classList.remove('hidden'); // Show login form
    roleSelectionContainer.classList.add('hidden'); // Hide role selection
    displayAdminPanel(false); // Ensure admin panel is hidden
    regularUserElements.forEach(el => el.classList.add('hidden')); // Hide main app content
    currentUserRole = null; // Reset role
    $('whoami').textContent = ''; // Clear username display
    return;
  }

  // User logged in or state changed (e.g., page refresh)
  $('auth-when-logged-in').classList.remove('hidden');
  $('whoami').textContent = `Logged in as: ${u.email || 'Guest User'}`;

  // Admin check (client-side)
  if (u.email === ADMIN_EMAIL) {
    displayAdminPanel(true);
    currentUserRole = null; // Admin has no 'trader'/'viewer' role in this context
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

// --- FIREBASE & DATA MANAGEMENT ---
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
  return onSnapshot(ref, (snap) => {
    portfolio = snap.data();
    renderSummary();
  });
}

function subscribeMarket() {
  const ref = doc(db, 'market', 'state');
  onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      market = snap.data();
      renderMarket(); // Re-render market when prices tick
    }
  });
}

// --- RENDERING FUNCTIONS ---
function renderSummary() {
  if (!portfolio) return;

  const cashElement = $('cash');
  const investedElement = $('invested');
  const currentValueElement = $('currentValue');
  const plElement = $('pl');
  const holdingsListElement = $('holdingsList');
  const watchlistListElement = $('watchlistList');
  const watchlistHeaderElement = $('watchlist-header');

  cashElement.textContent = fmt(portfolio.cashBalance);

  if (currentUserRole === 'trader') {
    // Show full portfolio for traders
    investedElement.parentElement.classList.remove('hidden');
    currentValueElement.parentElement.classList.remove('hidden');
    plElement.parentElement.classList.remove('hidden');
    holdingsListElement.classList.remove('hidden');
    watchlistHeaderElement.classList.add('hidden'); // Watchlist part of holdings for traders

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

    // Render holdings list
    holdingsListElement.innerHTML = '';
    if (portfolio.holdings && portfolio.holdings.length > 0) {
      for (const h of portfolio.holdings) {
        const stock = market.stocks.find(s => s.id === h.id);
        if (stock) {
          const holdingItem = document.createElement('div');
          holdingItem.className = 'flex justify-between items-center bg-gray-50 p-2 rounded holding-item';
          holdingItem.innerHTML = `
            <span>${stock.symbol} (${stock.name}): ${h.qty} shares</span>
            <span class="text-xs text-gray-500">Avg Cost: ${fmt(h.avg)}</span>
          `;
          holdingsListElement.appendChild(holdingItem);
        }
      }
    } else {
      holdingsListElement.innerHTML = '<p class="text-gray-500 italic">No holdings yet. Start trading!</p>';
    }
    // Clear viewer-specific elements
    watchlistListElement.innerHTML = '';

  } else if (currentUserRole === 'viewer') {
    // Hide trading-specific portfolio parts for viewers
    investedElement.parentElement.classList.add('hidden');
    currentValueElement.parentElement.classList.add('hidden');
    plElement.parentElement.classList.add('hidden');
    holdingsListElement.innerHTML = '<p class="text-gray-500 italic">Viewers do not have holdings.</p>';
    watchlistHeaderElement.classList.remove('hidden');

    // Render watchlist
    watchlistListElement.innerHTML = '';
    if (portfolio.watchlist && portfolio.watchlist.length > 0) {
        const map = Object.fromEntries(market.stocks.map(s => [s.id, s.price]));
        for (const stockId of portfolio.watchlist) {
            const stock = market.stocks.find(s => s.id === stockId);
            if (stock) {
                const watchlistItem = document.createElement('div');
                watchlistItem.className = 'flex justify-between items-center bg-gray-50 p-2 rounded holding-item';
                watchlistItem.innerHTML = `
                    <span>${stock.symbol} (${stock.name})</span>
                    <span class="text-base font-semibold">${fmt(stock.price)}</span>
                `;
                watchlistListElement.appendChild(watchlistItem);
            }
        }
    } else {
        watchlistListElement.innerHTML = '<p class="text-gray-500 italic">Your watchlist is empty. Add stocks from the market!</p>';
    }
  }
}

function renderMarket() {
  if (!market?.stocks?.length) return;
  
  // Populate category filter
  const categories = ['All', ...new Set(market.stocks.map(s => s.category))];
  const categoryFilter = $('categoryFilter');
  categoryFilter.innerHTML = '';
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categoryFilter.appendChild(option);
  });
  categoryFilter.onchange = () => renderCards(categoryFilter.value === 'All' ? null : categoryFilter.value);

  // Update market meta (last updated time)
  const lastUpdated = market.updatedAt ? new Date(market.updatedAt).toLocaleString() : 'N/A';
  $('marketMeta').textContent = `Last updated: ${lastUpdated}`;

  renderCards(categoryFilter.value === 'All' ? null : categoryFilter.value);
}

function renderCards(category = null) {
  let list = category ? market.stocks.filter(s => s.category === category) : market.stocks;
  
  // Apply search filter if active
  const searchTerm = $('search').value.toLowerCase();
  if (searchTerm) {
    list = list.filter(s => 
      s.name.toLowerCase().includes(searchTerm) || 
      s.symbol.toLowerCase().includes(searchTerm)
    );
  }

  const marketDiv = $('market');
  marketDiv.innerHTML = '';
  if (list.length === 0) {
    marketDiv.innerHTML = '<p class="text-center text-gray-500 col-span-full">No stocks found matching your criteria.</p>';
    return;
  }

  for (const s of list) {
    const card = document.createElement('div');
    card.className = 'card p-6 space-y-3 bg-white rounded-xl shadow-lg border border-gray-200';
    const ch = (s.price - s.prevClose);
    const cls = ch >= 0 ? 'good' : 'bad'; // Tailwind class for color

    let actionButtonHtml = '';
    const isOnWatchlist = portfolio?.watchlist?.includes(s.id);

    if (currentUserRole === 'trader') {
        actionButtonHtml = `<button class="btn btn-accent text-white px-4 py-2 rounded-md transition-colors" data-id="${s.id}" data-action="trade">Trade</button>`;
    } else if (currentUserRole === 'viewer') {
        if (isOnWatchlist) {
            actionButtonHtml = `<button class="btn watchlist-btn-remove px-4 py-2 rounded-md transition-colors" data-id="${s.id}" data-action="remove-watchlist">Remove from Watchlist</button>`;
        } else {
            actionButtonHtml = `<button class="btn watchlist-btn-add px-4 py-2 rounded-md transition-colors" data-id="${s.id}" data-action="add-watchlist">Add to Watchlist</button>`;
        }
    }

    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="font-bold text-xl">${s.name}</div>
        <div class="text-sm opacity-80 category-pill pill">${s.symbol}</div>
      </div>
      <div class="flex items-end justify-between">
        <div class="price text-4xl font-bold">${fmt(s.price)}</div>
        <div class="${cls} font-bold text-lg">${ch >= 0 ? '▲' : '▼'} ${ch.toFixed(2)}</div>
      </div>
      <div class="flex gap-4 pt-2">
        ${actionButtonHtml}
      </div>
    `;
    marketDiv.appendChild(card);
  }

  // Attach event listeners for dynamic buttons
  marketDiv.querySelectorAll('button[data-action]').forEach(btn => {
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

// Search input event listener
$('search').onkeyup = () => renderCards($('categoryFilter').value === 'All' ? null : $('categoryFilter').value);

// --- WATCHLIST FUNCTIONS ---
async function addToWatchlist(stockId) {
    if (!user || !user.uid) {
        $('authMsg').textContent = 'Please log in to manage your watchlist.';
        $('authMsg').style.color = 'red';
        return;
    }
    try {
        const uref = doc(db, 'users', user.uid);
        await updateDoc(uref, {
            watchlist: arrayUnion(stockId)
        });
        // UI will update via onSnapshot for portfolio
        console.log(`Added ${stockId} to watchlist.`);
    } catch (e) {
        console.error("Error adding to watchlist:", e);
        $('authMsg').textContent = `Error adding to watchlist: ${e.message}`;
        $('authMsg').style.color = 'red';
    }
}

async function removeFromWatchlist(stockId) {
    if (!user || !user.uid) {
        $('authMsg').textContent = 'Please log in to manage your watchlist.';
        $('authMsg').style.color = 'red';
        return;
    }
    try {
        const uref = doc(db, 'users', user.uid);
        await updateDoc(uref, {
            watchlist: arrayRemove(stockId)
        });
        // UI will update via onSnapshot for portfolio
        console.log(`Removed ${stockId} from watchlist.`);
    } catch (e) {
        console.error("Error removing from watchlist:", e);
        $('authMsg').textContent = `Error removing from watchlist: ${e.message}`;
        $('authMsg').style.color = 'red';
    }
}


// --- TRADING FUNCTIONS ---
let tradeStock = null;
function openTrade(id) {
  tradeStock = market.stocks.find(s => s.id === id);
  $('tradeTitle').textContent = `${tradeStock.name} (${tradeStock.symbol})`;
  $('tradePrice').textContent = `Price: ${fmt(tradeStock.price)}`;
  $('qty').value = 1;
  $('tradeMsg').textContent = '';
  $('trade').showModal();
}

$('cancel').onclick = () => $('trade').close();

$('buy').onclick = () => doTrade('BUY');
$('sell').onclick = () => doTrade('SELL');

async function doTrade(side) {
  try {
    const qty = Math.max(1, Number($('qty').value || 1));
    if (qty <= 0) throw new Error('Quantity must be at least 1.');

    const px = tradeStock.price;
    const uid = user.uid;

    await runTransaction(db, async (tx) => {
      const uref = doc(db, 'users', uid);
      const usnap = await tx.get(uref);
      const u = usnap.data();
      let cash = u.cashBalance;
      const holdings = [...(u.holdings || [])];
      const tcost = Number((px * qty).toFixed(2));

      if (side === 'BUY') {
        if (cash < tcost) throw new Error('Insufficient cash');
        cash -= tcost;
        const idx = holdings.findIndex(h => h.id === tradeStock.id);
        if (idx >= 0) {
          const h = holdings[idx];
          const newQty = h.qty + qty;
          const newAvg = ((h.avg * h.qty) + tcost) / newQty;
          holdings[idx] = { id: h.id, qty: newQty, avg: Number(newAvg.toFixed(2)) };
        } else {
          holdings.push({ id: tradeStock.id, qty, avg: px });
        }
      } else { // SELL
        const idx = holdings.findIndex(h => h.id === tradeStock.id);
        if (idx < 0 || holdings[idx].qty < qty) throw new Error('Not enough shares to sell.');
        const h = holdings[idx];
        const newQty = h.qty - qty;
        if (newQty === 0) { 
          holdings.splice(idx, 1); 
        } else { 
          holdings[idx] = { ...h, qty: newQty }; 
        }
        cash += tcost;
      }

      const transactions = [...(u.transactions || [])];
      transactions.push({ ts: Date.now(), id: tradeStock.id, side, qty, px });

      tx.update(uref, { cashBalance: Number(cash.toFixed(2)), holdings, transactions });
    });

    $('tradeMsg').textContent = 'Trade successful!';
    $('tradeMsg').style.color = 'green';
    setTimeout(() => $('trade').close(), 800);
  } catch (e) {
    $('tradeMsg').textContent = `Trade failed: ${e.message}`;
    $('tradeMsg').style.color = 'red';
  }
}

// --- THEME TOGGLE ---
$('theme').onclick = () => document.body.classList.toggle('dark');

// --- ADMIN PANEL FUNCTIONS (Client-side - NOT SECURE FOR PRODUCTION) ---
$('admin-create-user').onclick = async () => {
  const email = $('admin-user-email').value.trim();
  const password = $('admin-user-password').value.trim();
  const msgElement = $('admin-user-msg');
  if (!email || !password) {
    msgElement.textContent = 'Email and Password are required to create a user.';
    msgElement.style.color = 'red';
    return;
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await ensureUserDoc(userCredential.user.uid); // Create user's Firestore document
    msgElement.textContent = `User ${email} created successfully!`;
    msgElement.style.color = 'green';
  } catch (e) {
    msgElement.textContent = `Error creating user: ${e.message}`;
    msgElement.style.color = 'red';
  }
};

$('admin-change-password').onclick = async () => {
  const email = $('admin-user-email').value.trim();
  const newPassword = $('admin-user-password').value.trim();
  const msgElement = $('admin-user-msg');
  if (!email || !newPassword) {
    msgElement.textContent = 'Email and New Password are required to change password.';
    msgElement.style.color = 'red';
    return;
  }
  
  msgElement.textContent = 'Password change for other users requires Firebase Admin SDK. For current user: re-authenticate and then use updatePassword().';
  msgElement.style.color = 'orange';
};

$('admin-delete-user').onclick = async () => {
  const emailToDelete = $('admin-user-email').value.trim();
  const msgElement = $('admin-user-msg');
  if (!emailToDelete) {
    msgElement.textContent = 'Email is required to delete a user.';
    msgElement.style.color = 'red';
    return;
  }

  msgElement.textContent = 'User deletion for other users requires Firebase Admin SDK.';
  msgElement.style.color = 'orange';
};

$('admin-view-analytics').onclick = async () => {
  const analyticsOutput = $('analytics-output');
  analyticsOutput.innerHTML = '<p class="text-gray-500">Fetching user data...</p>';
  try {
    const usersColRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersColRef);
    
    let analyticsHtml = '<ul class="divide-y divide-gray-200">';
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      const userId = doc.id;
      analyticsHtml += `
        <li class="py-4 px-3 border-b border-gray-200 last:border-b-0">
          <p class="font-semibold text-blue-700">User ID: <span class="text-blue-500 break-words">${userId}</span></p>
          <p class="text-gray-700">Cash Balance: <span class="font-medium">${fmt(userData.cashBalance)}</span></p>
          <p class="text-gray-700">Holdings: <span class="font-mono text-xs break-words">${JSON.stringify(userData.holdings || [])}</span></p>
          <p class="text-gray-700">Transactions: <span class="font-mono text-xs break-words">${JSON.stringify(userData.transactions || [])}</span></p>
          <p class="text-gray-700">Watchlist: <span class="font-mono text-xs break-words">${JSON.stringify(userData.watchlist || [])}</span></p>
          <p class="text-xs text-gray-500">Created At: ${new Date(userData.createdAt).toLocaleString()}</p>
          <p class="text-xs text-gray-500">Last Role: ${userData.lastSelectedRole || 'N/A'}</p>
        </li>
      `;
    });
    analyticsHtml += '</ul>';
    analyticsOutput.innerHTML = analyticsHtml;
  } catch (e) {
    analyticsOutput.innerHTML = `<p class="text-red-500">Error fetching analytics: ${e.message}</p>`;
  }
};

// --- ADMIN MARKET TICK ---
$('btn-tick').onclick = async () => {
  try {
    const ref = doc(db, "market", "state");
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        $('marketMeta').textContent = "Market data not found!";
        $('marketMeta').style.color = 'red';
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

    $('marketMeta').textContent = "✅ Market prices updated!";
    $('marketMeta').style.color = 'green';
    setTimeout(() => {
        // Clear message after a short delay
        $('marketMeta').textContent = `Last updated: ${new Date(Date.now()).toLocaleString()}`;
        $('marketMeta').style.color = ''; // Reset color
    }, 2000);
  } catch (e) {
    $('marketMeta').textContent = `Error ticking market: ${e.message}`;
    $('marketMeta').style.color = 'red';
  }
};
