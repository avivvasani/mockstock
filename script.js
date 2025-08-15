// --- Firebase SDKs (modular, via ESM CDN) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- 1) Your Firebase config (client keys are OK to be public) ---
const firebaseConfig = {
  apiKey: "AIzaSyAmwb7V54q-nZK_5y-vm_i345iSXyrFZmc",
  authDomain: "mockstock-5c5e3.firebaseapp.com",
  projectId: "mockstock-5c5e3",
  storageBucket: "mockstock-5c5e3.firebasestorage.app",
  messagingSenderId: "480136918782",
  appId: "1:480136918782:web:393d8ec0099e866c9617af",
  measurementId: "G-VJHD474WRZ"
};

// --- 2) Init ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 3) DOM refs ---
const elStocks = document.getElementById("stocksGrid");
const elFilter = document.getElementById("categoryFilter");
const elSearch = document.getElementById("search");
const elMeta = document.getElementById("marketMeta");
const elTick = document.getElementById("btn-tick");

const elOut = document.getElementById("auth-when-logged-out");
const elIn = document.getElementById("auth-when-logged-in");
const elWho = document.getElementById("whoami");
const btnSignup = document.getElementById("btn-signup");
const btnLogin = document.getElementById("btn-login");
const btnGoogle = document.getElementById("btn-google");
const btnLogout = document.getElementById("btn-logout");
const email = document.getElementById("email");
const password = document.getElementById("password");

// --- 4) Auth handlers ---
btnSignup.addEventListener("click", async () => {
  if (!email.value || !password.value) return alert("Enter email & password");
  await createUserWithEmailAndPassword(auth, email.value, password.value);
});
btnLogin.addEventListener("click", async () => {
  if (!email.value || !password.value) return alert("Enter email & password");
  await signInWithEmailAndPassword(auth, email.value, password.value);
});
btnGoogle.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
});
btnLogout.addEventListener("click", () => signOut(auth));

// --- 5) Market state ---
let MARKET = {
  categories: ["All"],
  stocks: []
};
let activeCategory = "All";
let searchTerm = "";

elFilter.addEventListener("change", () => {
  activeCategory = elFilter.value;
  renderStocks();
});
elSearch.addEventListener("input", () => {
  searchTerm = elSearch.value.trim().toLowerCase();
  renderStocks();
});

// Subscribe to Firestore market/state (single shared state for everyone)
const marketRef = doc(db, "market", "state");
onSnapshot(marketRef, (snap) => {
  if (!snap.exists()) {
    elMeta.textContent = "No market data. (Create market/state in Firestore or upload JSON.)";
    return;
  }
  MARKET = snap.data();
  fillCategories(MARKET.categories || ["All"]);
  renderStocks();
  elMeta.textContent = `Updated: ${new Date(MARKET.updatedAt || Date.now()).toLocaleString()}`;
});

// --- 6) Admin-only Tick Market ---
elTick.addEventListener("click", tickMarketNow);

async function tickMarketNow() {
  const snap = await getDoc(marketRef);
  if (!snap.exists()) {
    alert("Market data not found");
    return;
  }
  const data = snap.data();
  const stocks = (data.stocks || []).map(s => {
    const pct = (Math.random() * 4 - 2) / 100; // -2%..+2%
    const next = +(s.price * (1 + pct)).toFixed(2);
    return { ...s, prevClose: s.price, price: next };
  });
  await setDoc(marketRef, { ...data, stocks, updatedAt: Date.now() });
  // Optional toast:
  alert("✅ Prices ticked for everyone");
}

// --- 7) Admin gate: only show the tick button if users/{uid}.role == "admin"
onAuthStateChanged(auth, async (user) => {
  if (user) {
    elOut.classList.add("hidden");
    elIn.classList.remove("hidden");
    elWho.textContent = user.email || user.displayName || user.uid;

    // Ensure users/{uid} exists (first login bootstrap)
    const userRef = doc(db, "users", user.uid);
    const uSnap = await getDoc(userRef);
    if (!uSnap.exists()) {
      await setDoc(userRef, { role: "user", createdAt: Date.now(), email: user.email || null });
    }

    // Fetch role and toggle admin UI
    const freshSnap = await getDoc(userRef);
    const role = freshSnap.exists() ? freshSnap.data().role : "user";
    if (role === "admin") {
      elTick.classList.remove("hidden");
    } else {
      elTick.classList.add("hidden");
    }
  } else {
    elOut.classList.remove("hidden");
    elIn.classList.add("hidden");
    elWho.textContent = "";
    elTick.classList.add("hidden");
  }
});

// --- 8) Rendering helpers ---
function fillCategories(cats) {
  const uniq = Array.from(new Set(["All", ...(cats || [])]));
  const prev = elFilter.value || "All";
  elFilter.innerHTML = uniq.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  elFilter.value = prev;
  activeCategory = elFilter.value;
}

function renderStocks() {
  const list = (MARKET.stocks || [])
    .filter(s => activeCategory === "All" || s.category === activeCategory)
    .filter(s => {
      if (!searchTerm) return true;
      const hay = `${s.name} ${s.symbol}`.toLowerCase();
      return hay.includes(searchTerm);
    });

  elStocks.innerHTML = list.map(s => {
    const diff = +(s.price - s.prevClose).toFixed(2);
    const pct = s.prevClose ? +(((s.price - s.prevClose) / s.prevClose) * 100).toFixed(2) : 0;
    const dir = diff >= 0 ? "up" : "down";
    return `
      <article class="card">
        <div class="row">
          <div class="symbol">${escapeHtml(s.symbol)}</div>
          <span class="chip">${escapeHtml(s.category || "—")}</span>
        </div>
        <div class="row">
          <div class="name">${escapeHtml(s.name)}</div>
          <div class="price">₹${numberFmt(s.price)}</div>
        </div>
        <div class="row muted">
          <div>Prev: ₹${numberFmt(s.prevClose)}</div>
          <div class="${dir}">${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff)} (${Math.abs(pct)}%)</div>
        </div>
      </article>
    `;
  }).join("");
}

function numberFmt(n){ return (n ?? 0).toLocaleString(undefined, {maximumFractionDigits:2}); }
function escapeHtml(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
