import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, signInAnonymously, signOut,
  deleteUser, updatePassword, updateEmail 
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { 
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction,
  collection, getDocs 
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

const START_CASH = 100000;

// Admin credentials (for client-side check - NOT SECURE FOR PRODUCTION)
const ADMIN_EMAIL = "Admin";
const ADMIN_PASSWORD = "Admin_123";

// Elements to show/hide for regular user
const regularUserElements = [$('summary'), $('market-section')];
// Elements to show/hide for admin
const adminPanel = $('admin-panel');


// Auth events
$('btn-login').onclick = async () => {
  try {
    const email = $('email').value.trim();
    const password = $('password').value.trim();
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Client-side admin check (NOT SECURE FOR PRODUCTION)
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      displayAdminPanel(true);
      $('whoami').textContent = `Admin User: ${userCredential.user.email}`;
    } else {
      displayAdminPanel(false);
    }

  } catch (e) {
    $('authMsg').textContent = e.message;
  }
};

$('btn-signup').onclick = async () => {
  try {
    await createUserWithEmailAndPassword(auth, $('email').value.trim(), $('password').value.trim());
  } catch (e) {
    $('authMsg').textContent = e.message;
  }
};

$('btn-guest').onclick = async () => {
  try {
    await signInAnonymously(auth);
    displayAdminPanel(false); // Guest is never an admin
  } catch (e) {
    $('authMsg').textContent = e.message;
  }
};

$('btn-logout').onclick = async () => {
  await signOut(auth);
  displayAdminPanel(false); // Hide admin panel on logout
  // Other UI elements will be handled by onAuthStateChanged
};

// Function to control admin panel visibility
function displayAdminPanel(isAdmin) {
  if (isAdmin) {
    adminPanel.classList.remove('hidden');
    regularUserElements.forEach(el => el.classList.add('hidden'));
  } else {
    adminPanel.classList.add('hidden');
    regularUserElements.forEach(el => el.classList.remove('hidden'));
  }
}

// Auth state change
onAuthStateChanged(auth, async (u) => {
  user = u;
  $('authMsg').textContent = '';
  if (!u) {
    $('auth-when-logged-out').classList.remove('hidden');
    $('auth-when-logged-in').classList.add('hidden');
    displayAdminPanel(false); // Hide admin panel and show regular UI on logout
    // Explicitly hide summary and market when logged out
    $('summary').classList.add('hidden');
    $('market-section').classList.add('hidden');
    return;
  }

  $('auth-when-logged-out').classList.add('hidden');
  $('auth-when-logged-in').classList.remove('hidden');
  $('whoami').textContent = `Logged in as: ${u.email || 'Guest'}`;

  // Re-check for admin status on auth state change (e.g., page refresh)
  // This is still client-side and not secure for production.
  if (u.email === ADMIN_EMAIL) { // Only check email here, as password is not available directly
    // This is a simplified check. In a real app, you'd check Firebase Custom Claims.
    displayAdminPanel(true);
  } else {
    displayAdminPanel(false);
    await ensureUserDoc(u.uid);
    subscribePortfolio(u.uid);
    subscribeMarket();
  }
});

async function ensureUserDoc(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      createdAt: Date.now(),
      cashBalance: START_CASH,
      holdings: [],
      transactions: []
    });
  }
}

// Subscriptions
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
      renderMarket();
    }
  });
}

// Rendering
function renderSummary() {
  if (!portfolio) return;
  $('cash').textContent = fmt(portfolio.cashBalance);
  const map = Object.fromEntries(market.stocks.map(s => [s.id, s.price]));
  let invested = 0, current = 0;
  for (const h of (portfolio.holdings || [])) {
    invested += (h.avg || 0) * h.qty;
    current += (map[h.id] || 0) * h.qty;
  }
  $('invested').textContent = fmt(invested);
  $('currentValue').textContent = fmt(current);
  const pl = current + portfolio.cashBalance - START_CASH;
  $('pl').textContent = fmt(pl);
  $('summary').classList.remove('hidden');

  // Render holdings list
  const holdingsList = $('holdingsList');
  holdingsList.innerHTML = '';
  if (portfolio.holdings && portfolio.holdings.length > 0) {
    for (const h of portfolio.holdings) {
      const stock = market.stocks.find(s => s.id === h.id);
      if (stock) {
        const holdingItem = document.createElement('div');
        holdingItem.className = 'flex justify-between items-center bg-gray-50 p-2 rounded';
        holdingItem.innerHTML = `
          <span>${stock.symbol} (${stock.name}): ${h.qty} shares</span>
          <span class="text-xs text-gray-500">Avg: ${fmt(h.avg)}</span>
        `;
        holdingsList.appendChild(holdingItem);
      }
    }
  } else {
    holdingsList.innerHTML = '<p class="text-gray-500 italic">No holdings yet.</p>';
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
    card.className = 'card p-4 space-y-2 bg-white rounded-lg shadow-md border border-gray-200';
    const ch = (s.price - s.prevClose);
    const cls = ch >= 0 ? 'good' : 'bad'; // Tailwind class for color

    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="font-bold text-lg">${s.name}</div>
        <div class="text-xs opacity-70 pill bg-gray-200 text-gray-700 px-2 py-1 rounded-full">${s.symbol}</div>
      </div>
      <div class="flex items-end justify-between">
        <div class="price text-2xl font-bold">${fmt(s.price)}</div>
        <div class="${cls} font-bold text-base">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}</div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-accent bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors" data-id="${s.id}">Trade</button>
      </div>
    `;
    marketDiv.appendChild(card);
  }
  marketDiv.querySelectorAll('button[data-id]').forEach(btn => {
    btn.onclick = () => openTrade(btn.dataset.id);
  });
}

// Search input event listener
$('search').onkeyup = () => renderCards($('categoryFilter').value === 'All' ? null : $('categoryFilter').value);

// Trading
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
      } else {
        const idx = holdings.findIndex(h => h.id === tradeStock.id);
        if (idx < 0 || holdings[idx].qty < qty) throw new Error('Not enough shares');
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

    $('tradeMsg').textContent = 'Success!';
    setTimeout(() => $('trade').close(), 400);
  } catch (e) {
    $('tradeMsg').textContent = e.message;
  }
}

// Theme toggle
$('theme').onclick = () => document.body.classList.toggle('dark');

// Admin Panel Functions (Client-side - NOT SECURE FOR PRODUCTION)
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
  
  // This is a placeholder. Firebase Admin SDK is needed for this securely.
  // For client-side, the user would need to be logged in as the user whose password they want to change.
  // This would typically involve re-authenticating the user.
  msgElement.textContent = 'Password change via client-side admin is not directly supported for other users. An admin must use Firebase Admin SDK or a secure Cloud Function.';
  msgElement.style.color = 'orange';

  // Example of changing password for the *currently logged-in* user (if they are admin)
  // if (user && user.email === email) {
  //   try {
  //     await updatePassword(user, newPassword);
  //     msgElement.textContent = `Password for ${email} updated successfully!`;
  //     msgElement.style.color = 'green';
  //   } catch (e) {
  //     msgElement.textContent = `Error updating password: ${e.message}`;
  //     msgElement.style.color = 'red';
  //   }
  // } else {
  //   msgElement.textContent = 'To change another user\'s password, you need Firebase Admin SDK.';
  //   msgElement.style.color = 'orange';
  // }
};

$('admin-delete-user').onclick = async () => {
  const emailToDelete = $('admin-user-email').value.trim();
  const msgElement = $('admin-user-msg');
  if (!emailToDelete) {
    msgElement.textContent = 'Email is required to delete a user.';
    msgElement.style.color = 'red';
    return;
  }

  // This is a placeholder. Firebase Admin SDK is needed for this securely.
  msgElement.textContent = 'User deletion via client-side admin is not directly supported. An admin must use Firebase Admin SDK or a secure Cloud Function.';
  msgElement.style.color = 'orange';

  // Example of deleting the *currently logged-in* user (if they are admin)
  // if (user && user.email === emailToDelete) {
  //   try {
  //     await deleteUser(user);
  //     msgElement.textContent = `User ${emailToDelete} deleted successfully!`;
  //     msgElement.style.color = 'green';
  //   } catch (e) {
  //     msgElement.textContent = `Error deleting user: ${e.message}`;
  //     msgElement.style.color = 'red';
  //   }
  // } else {
  //   msgElement.textContent = 'To delete another user, you need Firebase Admin SDK.';
  //   msgElement.style.color = 'orange';
  // }
};

$('admin-view-analytics').onclick = async () => {
  const analyticsOutput = $('analytics-output');
  analyticsOutput.innerHTML = '<p class="text-gray-500">Fetching user data...</p>';
  try {
    const usersColRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersColRef);
    
    let analyticsHtml = '<ul>';
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      const userId = doc.id;
      analyticsHtml += `
        <li class="mb-4 p-3 border border-gray-200 rounded-md bg-white">
          <p class="font-semibold">User ID: <span class="text-indigo-600">${userId}</span></p>
          <p>Cash Balance: ${fmt(userData.cashBalance)}</p>
          <p>Holdings: ${JSON.stringify(userData.holdings || [])}</p>
          <p>Transactions: ${JSON.stringify(userData.transactions || [])}</p>
          <p class="text-xs text-gray-500">Created At: ${new Date(userData.createdAt).toLocaleString()}</p>
        </li>
      `;
    });
    analyticsHtml += '</ul>';
    analyticsOutput.innerHTML = analyticsHtml;
  } catch (e) {
    analyticsOutput.innerHTML = `<p class="text-red-500">Error fetching analytics: ${e.message}</p>`;
  }
};

// Tick Market Now button from original index.js, integrated into app.js
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
