import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, signInAnonymously, signOut 
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { 
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction 
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

// Auth events
$('login').onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, $('email').value.trim(), $('pass').value.trim());
  } catch (e) {
    $('authMsg').textContent = e.message;
  }
};

$('register').onclick = async () => {
  try {
    await createUserWithEmailAndPassword(auth, $('email').value.trim(), $('pass').value.trim());
  } catch (e) {
    $('authMsg').textContent = e.message;
  }
};

$('guest').onclick = async () => {
  try {
    await signInAnonymously(auth);
  } catch (e) {
    $('authMsg').textContent = e.message;
  }
};

$('logout').onclick = () => signOut(auth);

// Auth state change
onAuthStateChanged(auth, async (u) => {
  user = u;
  $('authMsg').textContent = '';
  if (!u) {
    $('auth').classList.remove('hidden');
    $('summary').classList.add('hidden');
    $('market').classList.add('hidden');
    $('filters').classList.add('hidden');
    return;
  }
  $('auth').classList.add('hidden');
  await ensureUserDoc(u.uid);
  subscribePortfolio(u.uid);
  subscribeMarket();
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
}

function renderMarket() {
  if (!market?.stocks?.length) return;
  const cats = market.categories || ['All', ...new Set(market.stocks.map(s => s.category))];
  $('cats').innerHTML = '';
  cats.forEach(c => {
    const b = document.createElement('button');
    b.className = 'pill';
    b.textContent = c;
    b.onclick = () => renderCards(c === 'All' ? null : c);
    $('cats').appendChild(b);
  });
  $('filters').classList.remove('hidden');
  renderCards();
}

function renderCards(category = null) {
  const list = category ? market.stocks.filter(s => s.category === category) : market.stocks;
  $('market').innerHTML = '';
  for (const s of list) {
    const card = document.createElement('div');
    card.className = 'card p-4 space-y-2';
    const ch = (s.price - s.prevClose);
    const cls = ch >= 0 ? 'good' : 'bad';
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="font-bold">${s.name}</div>
        <div class="text-xs opacity-70 pill">${s.symbol}</div>
      </div>
      <div class="flex items-end justify-between">
        <div class="price">${fmt(s.price)}</div>
        <div class="${cls} font-bold">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}</div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-accent" data-id="${s.id}">Trade</button>
      </div>
    `;
    $('market').appendChild(card);
  }
  $('market').querySelectorAll('button[data-id]').forEach(btn => {
    btn.onclick = () => openTrade(btn.dataset.id);
  });
  $('market').classList.remove('hidden');
}

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
