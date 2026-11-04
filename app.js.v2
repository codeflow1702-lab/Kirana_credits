import { auth, googleProvider, db } from "./firebase.js";
import {
  onAuthStateChanged, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const startupView = $("startupView");
const loginView = $("loginView");
const appView = $("appView");
const dashboardSkeleton = $("dashboardSkeleton");
const dashboardContent = $("dashboardContent");
const dialog = $("transactionDialog");

let currentUser = null;
let transactions = [];
let stopListening = null;
let toastTimer = null;
let lastSyncedAt = null;
let dataLoadFailed = false;
let isSaving = false;

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2
}).format(Number(value) || 0);

const localDate = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const selectedMonth = () => $("monthFilter").value || localDate().slice(0, 7);
const monthTransactions = () => transactions.filter(t => (t.date || "").slice(0, 7) === selectedMonth());
const sum = (items, type) => items
  .filter(t => t.type === type)
  .reduce((total, t) => total + (Number(t.amount) || 0), 0);
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

function setMessage(id, text, isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function showToast(message, type = "success") {
  const region = $("toastRegion");
  region.innerHTML = "";
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast-error" : "toast-success"}`;
  toast.textContent = message;
  region.append(toast);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), 3400);
}

function setTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = safeTheme;
  try { localStorage.setItem("kirana-theme", safeTheme); } catch { /* Theme still works for this session. */ }
  $("themeBtn").textContent = safeTheme === "dark" ? "☀" : "◐";
  $("themeBtn").title = safeTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  $("themeBtn").setAttribute("aria-label", $("themeBtn").title);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = safeTheme === "dark" ? "#171b18" : "#f6f7f4";
}

let savedTheme = "light";
try { savedTheme = localStorage.getItem("kirana-theme") || "light"; } catch { /* Use the default theme. */ }
setTheme(savedTheme);
$("themeBtn").addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

function showStartup() {
  startupView.classList.remove("hidden");
  loginView.classList.add("hidden");
  appView.classList.add("hidden");
}
function showLogin() {
  startupView.classList.add("hidden");
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
}
function showApp() {
  startupView.classList.add("hidden");
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
}
function setDashboardLoading(isLoading) {
  dashboardSkeleton.classList.toggle("hidden", !isLoading);
  dashboardContent.classList.toggle("hidden", isLoading);
}

function setConnectionStatus(state, syncLabel) {
  const dot = $("connectionDot");
  const text = $("connectionText");
  dot.classList.remove("is-online", "is-offline", "is-syncing");
  if (state === "offline") {
    dot.classList.add("is-offline");
    text.textContent = "Offline";
    $("syncText").textContent = "Showing saved data when available";
    return;
  }
  if (state === "syncing") {
    dot.classList.add("is-syncing");
    text.textContent = "Connecting";
    $("syncText").textContent = syncLabel || "Syncing your ledger…";
    return;
  }
  dot.classList.add("is-online");
  text.textContent = "Online";
  $("syncText").textContent = syncLabel || (lastSyncedAt ? `Last synced ${lastSyncedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Connected");
}

window.addEventListener("offline", () => setConnectionStatus("offline"));
window.addEventListener("online", () => setConnectionStatus("syncing", "Connection restored; syncing…"));

$("loginBtn").addEventListener("click", async () => {
  const button = $("loginBtn");
  button.disabled = true;
  $("loginSpinner").classList.remove("hidden");
  $("loginButtonText").textContent = "Opening Google…";
  setMessage("loginMessage", "");
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    const message = error.code === "auth/popup-blocked"
      ? "Your browser blocked the sign-in window. Allow pop-ups and try again."
      : error.code === "auth/unauthorized-domain"
        ? "This website domain is not authorised in Firebase Authentication."
        : error.message || "Could not sign in. Please try again.";
    setMessage("loginMessage", message, true);
  } finally {
    button.disabled = false;
    $("loginSpinner").classList.add("hidden");
    $("loginButtonText").textContent = "Continue with Google";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  const button = $("logoutBtn");
  button.disabled = true;
  button.textContent = "Signing out…";
  try {
    await signOut(auth);
  } catch (error) {
    showToast(error.message || "Could not sign out.", "error");
    button.disabled = false;
    button.textContent = "Sign out";
  }
});

// Auth resolution is separate from the Firestore loading state so the
// dashboard never flashes before Firebase restores the correct account.
showStartup();
onAuthStateChanged(auth, user => {
  if (stopListening) {
    stopListening();
    stopListening = null;
  }

  currentUser = user || null;
  transactions = [];
  dataLoadFailed = false;
  lastSyncedAt = null;

  if (!user) {
    setDashboardLoading(false);
    showLogin();
    $("logoutBtn").disabled = false;
    $("logoutBtn").textContent = "Sign out";
    $("transactionRows").innerHTML = '<tr><td colspan="5" class="empty-state">Sign in to load your transactions.</td></tr>';
    setConnectionStatus(navigator.onLine ? "syncing" : "offline", "Sign in to continue");
    return;
  }

  showApp();
  setDashboardLoading(true);
  setConnectionStatus(navigator.onLine ? "syncing" : "offline", "Loading your transactions…");
  $("userName").textContent = user.displayName || user.email || "";
  const photo = $("userPhoto");
  if (user.photoURL) {
    photo.src = user.photoURL;
    photo.classList.remove("hidden");
    photo.onerror = () => photo.classList.add("hidden");
  } else {
    photo.removeAttribute("src");
    photo.classList.add("hidden");
  }
  $("monthFilter").value = localDate().slice(0, 7);
  $("searchInput").value = "";
  listenToTransactions();
}, error => {
  showLogin();
  setMessage("loginMessage", error.message || "Could not restore your sign-in session.", true);
});

function listenToTransactions() {
  if (!currentUser) return;
  // Keep V1's exact collection path and document shape for full compatibility.
  const ref = collection(db, "users", currentUser.uid, "transactions");
  const q = query(ref, orderBy("date", "desc"));

  stopListening = onSnapshot(q, { includeMetadataChanges: true }, snapshot => {
    transactions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    dataLoadFailed = false;
    setDashboardLoading(false);
    render();
    setMessage("dataMessage", "");

    if (!navigator.onLine) {
      setConnectionStatus("offline");
    } else if (snapshot.metadata.fromCache) {
      setConnectionStatus("online", "Showing saved data; waiting for server sync");
    } else {
      lastSyncedAt = new Date();
      setConnectionStatus("online", `Synced ${lastSyncedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);
    }
  }, error => {
    dataLoadFailed = true;
    setDashboardLoading(false);
    render();
    if (error.code === "permission-denied") {
      setMessage("dataMessage", "Firebase denied access to this account. Check that the Firestore Rules allow this signed-in user to read users/{uid}/transactions.", true);
    } else {
      setMessage("dataMessage", `Could not load transactions: ${error.message || "Please check your connection."}`, true);
    }
    setConnectionStatus(navigator.onLine ? "online" : "offline", "Data could not be refreshed");
  });
}

function render() {
  if (dataLoadFailed) {
    $("transactionRows").innerHTML = '<tr><td colspan="5" class="empty-state">Transactions could not be loaded. Check the message below and try refreshing the page.</td></tr>';
    return;
  }

  const totalPurchases = sum(transactions, "purchase");
  const totalPayments = sum(transactions, "payment");
  const monthItems = monthTransactions();
  const purchases = sum(monthItems, "purchase");
  const payments = sum(monthItems, "payment");

  $("totalBalance").textContent = money(totalPurchases - totalPayments);
  $("monthPurchases").textContent = money(purchases);
  $("monthPayments").textContent = money(payments);
  $("reportPurchases").textContent = money(purchases);
  $("reportPayments").textContent = money(payments);
  $("reportNet").textContent = money(purchases - payments);
  $("reportMonthLabel").textContent = new Date(`${selectedMonth()}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const term = $("searchInput").value.trim().toLowerCase();
  const visible = [...transactions]
    .filter(t => `${t.description || ""} ${t.type || ""} ${t.date || ""}`.toLowerCase().includes(term))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (!transactions.length) {
    $("transactionRows").innerHTML = `
      <tr><td colspan="5" class="empty-state">
        <span class="empty-state-icon" aria-hidden="true">＋</span>
        <strong>No transactions yet</strong>
        <span>Add your first purchase or payment to get started.</span>
      </td></tr>`;
    return;
  }
  if (!visible.length) {
    $("transactionRows").innerHTML = '<tr><td colspan="5" class="empty-state">No matching transactions. Try another search.</td></tr>';
    return;
  }

  $("transactionRows").innerHTML = visible.map(t => `
    <tr>
      <td>${escapeHtml(formatDate(t.date))}</td>
      <td>${escapeHtml(t.description || (t.type === "payment" ? "Payment" : "Purchase"))}</td>
      <td><span class="type-pill">${t.type === "payment" ? "Payment" : "Purchase"}</span></td>
      <td class="right ${t.type === "payment" ? "amount-payment" : "amount-purchase"}">${t.type === "payment" ? "− " : "+ "}${money(Number(t.amount))}</td>
      <td class="right"><span class="row-actions">
        <button type="button" data-edit="${escapeHtml(t.id)}" aria-label="Edit transaction">Edit</button>
        <button type="button" class="delete" data-delete="${escapeHtml(t.id)}" aria-label="Delete transaction">Delete</button>
      </span></td>
    </tr>`).join("");
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

$("monthFilter").addEventListener("change", render);
$("searchInput").addEventListener("input", render);

function openEntry(type, transaction = null) {
  $("transactionForm").reset();
  $("editId").value = transaction?.id || "";
  $("entryType").value = transaction?.type || type;
  $("entryAmount").value = transaction?.amount ?? "";
  $("entryDate").value = transaction?.date || localDate();
  $("entryDescription").value = transaction?.description || "";
  const editing = !!transaction;
  $("dialogEyebrow").textContent = editing ? "EDIT ENTRY" : "NEW ENTRY";
  $("dialogTitle").textContent = editing ? "Edit transaction" : (type === "payment" ? "Record payment" : "Add purchase");
  $("saveButtonText").textContent = editing ? "Save changes" : "Save entry";
  $("saveSpinner").classList.add("hidden");
  $("saveEntryBtn").disabled = false;
  isSaving = false;
  setMessage("formMessage", "");
  dialog.showModal();
  $("entryAmount").focus();
}
$("addPurchaseBtn").addEventListener("click", () => openEntry("purchase"));
$("addPaymentBtn").addEventListener("click", () => openEntry("payment"));
$("closeDialogBtn").addEventListener("click", () => { if (!isSaving) dialog.close(); });
$("cancelDialogBtn").addEventListener("click", () => { if (!isSaving) dialog.close(); });

dialog.addEventListener("cancel", event => {
  if (isSaving) event.preventDefault();
});

$("transactionForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (isSaving || !currentUser) return;

  const amount = Number($("entryAmount").value);
  if (!Number.isFinite(amount) || amount <= 0) {
    setMessage("formMessage", "Enter an amount greater than zero.", true);
    return;
  }
  const record = {
    type: $("entryType").value,
    amount: Math.round(amount * 100) / 100,
    date: $("entryDate").value,
    description: $("entryDescription").value.trim(),
    updatedAt: serverTimestamp()
  };
  if (!record.date) {
    setMessage("formMessage", "Choose a date.", true);
    return;
  }

  isSaving = true;
  const saveButton = $("saveEntryBtn");
  saveButton.disabled = true;
  $("saveSpinner").classList.remove("hidden");
  $("saveButtonText").textContent = "Saving…";
  setMessage("formMessage", "Saving your entry…");

  try {
    const ref = collection(db, "users", currentUser.uid, "transactions");
    const id = $("editId").value;
    if (id) {
      await updateDoc(doc(ref, id), record);
      showToast("Transaction updated.");
    } else {
      await addDoc(ref, { ...record, createdAt: serverTimestamp() });
      showToast(record.type === "payment" ? "Payment recorded." : "Purchase added.");
    }
    dialog.close();
  } catch (error) {
    const message = error.code === "permission-denied"
      ? "Firebase blocked this change. Please check your Firestore Rules."
      : error.message || "Could not save this entry. Please try again.";
    setMessage("formMessage", message, true);
  } finally {
    isSaving = false;
    saveButton.disabled = false;
    $("saveSpinner").classList.add("hidden");
    $("saveButtonText").textContent = $("editId").value ? "Save changes" : "Save entry";
  }
});

$("transactionRows").addEventListener("click", async event => {
  const editId = event.target.closest("button")?.dataset.edit;
  const deleteId = event.target.closest("button")?.dataset.delete;
  if (editId) {
    const found = transactions.find(t => t.id === editId);
    if (found) openEntry(found.type, found);
  }
  if (deleteId) {
    const found = transactions.find(t => t.id === deleteId);
    if (!found || !currentUser) return;
    const label = found.description || found.type;
    if (!window.confirm(`Delete "${label}" for ${money(found.amount)}? This cannot be undone.`)) return;
    const deleteButton = event.target.closest("button");
    deleteButton.disabled = true;
    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "transactions", deleteId));
      showToast("Transaction deleted.");
    } catch (error) {
      showToast(error.code === "permission-denied" ? "Firebase blocked deletion. Check your Firestore Rules." : (error.message || "Could not delete transaction."), "error");
      deleteButton.disabled = false;
    }
  }
});

function csvEscape(value) {
  let text = String(value ?? "");
  // Prevent user-entered text from being interpreted as a spreadsheet formula.
  if (/^[\s\u0000-\u001f]*[=+@]/.test(text) || /^\s*-/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function downloadCsv(items, filename) {
  const rows = [
    ["Date", "Description", "Type", "Amount (INR)"],
    ...[...items]
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .map(t => [t.date || "", t.description || "", t.type || "", (Number(t.amount) || 0).toFixed(2)])
  ];
  const csv = "\uFEFF" + rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("exportMonthBtn").addEventListener("click", () => {
  const month = selectedMonth();
  downloadCsv(monthTransactions(), `kirana-ledger-${month}.csv`);
  showToast(`Exported ${monthTransactions().length} transaction(s) for ${month}.`);
});
$("exportAllBtn").addEventListener("click", () => {
  downloadCsv(transactions, "kirana-ledger-all-history.csv");
  showToast(`Exported ${transactions.length} transaction(s).`);
});
$("printBtn").addEventListener("click", () => window.print());

$("whatsappBtn").addEventListener("click", () => {
  const month = selectedMonth();
  const items = monthTransactions();
  const purchases = sum(items, "purchase");
  const payments = sum(items, "payment");
  const balance = sum(transactions, "purchase") - sum(transactions, "payment");
  const label = new Date(`${month}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const message = [
    `Kirana Ledger — ${label}`,
    `Purchases: ${money(purchases)}`,
    `Payments: ${money(payments)}`,
    `Net change this month: ${money(purchases - payments)}`,
    `Current outstanding balance: ${money(balance)}`
  ].join("\n");
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
});
