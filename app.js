// app.js
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

// Sections
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

// Simulated user database (localStorage could be used instead)
let users = JSON.parse(localStorage.getItem("users")) || [
    { username: "Admin", password: "Admin_123", role: "admin" },
];

let currentUser = null;

// Theme toggle
themeBtn?.addEventListener("click", () => {
    document.body.classList.toggle("dark");
});

// Login
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

// Guest login
btnGuest.addEventListener("click", () => {
    currentUser = { username: "Guest", role: "guest" };
    loginUser();
});

// Logout
btnLogout.addEventListener("click", () => {
    currentUser = null;
    authContainer.classList.remove("hidden");
    summarySection.classList.add("hidden");
    marketSection.classList.add("hidden");
    adminPanel.classList.add("hidden");
    authWhenLoggedIn.classList.add("hidden");
});

// Handle login UI
function loginUser() {
    authContainer.classList.add("hidden");
    summarySection.classList.remove("hidden");
    marketSection.classList.remove("hidden");
    authWhenLoggedIn.classList.remove("hidden");
    whoami.textContent = currentUser.username;

    if (currentUser.role === "admin") {
        adminPanel.classList.remove("hidden");
        document.getElementById("btn-tick").classList.remove("hidden");
    }
}

// Admin: create user
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
    users.push({ username, password, role: "user" });
    saveUsers();
    adminUserMsg.textContent = `User "${username}" created successfully!`;
});

// Admin: change password
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
    adminUserMsg.textContent = `Password for "${username}" changed successfully!`;
});

// Admin: delete user
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
    adminUserMsg.textContent = `User "${username}" deleted successfully!`;
});

// Admin: view analytics
btnViewAnalytics.addEventListener("click", () => {
    analyticsOutput.innerHTML = users.map(u => {
        return `<p>${u.username} - Role: ${u.role}</p>`;
    }).join("");
});

// Save users to localStorage
function saveUsers() {
    localStorage.setItem("users", JSON.stringify(users));
}
