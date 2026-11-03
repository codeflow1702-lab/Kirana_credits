import { auth, googleProvider, db } from "./firebase.js";
import {
  onAuthStateChanged, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const loginView = $("loginView");
const appView = $("appView");
const dialog = $("transactionDialog");
let currentUser = null;
let transactions = [];
let stopListening = null;

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2
}).format(value || 0);

const localDate = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const selectedMonth = () => $("monthFilter").value || localDate().slice(0, 7);
const monthTransactions = () => transactions.filter(t => (t.date || "").slice(0, 7) === selectedMonth());
const sum = (items, type) => items.filter(t => t.type === type).reduce((total, t) => total + Number(t.amount || 0), 0);
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

function setMessage(id, text, isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("kirana-theme", theme);
  $("themeBtn").textContent = theme === "dark" ? "☀" : "◐";
  $("themeBtn").title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
}
setTheme(localStorage.getItem("kirana-theme") || "light");
$("themeBtn").addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

$("loginBtn").addEventListener("click", async () => {
  setMessage("loginMessage", "Opening Google sign-in…");
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    setMessage("loginMessage", error.message || "Could not sign in.", true);
  }
});
$("logoutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  currentUser = user;
  loginView.classList.toggle("hidden", !!user);
  appView.classList.toggle("hidden", !user);
  if (!user) {
    if (stopListening) stopListening();
    transactions = [];
    return;
  }
  $("userName").textContent = user.displayName || user.email || "";
  $("userPhoto").src = user.photoURL || "";
  $("userPhoto").classList.toggle("hidden", !user.photoURL);
  $("monthFilter").value = localDate().slice(0, 7);
  listenToTransactions();
});

function listenToTransactions() {
  if (stopListening) stopListening();
  const ref = collection(db, "users", currentUser.uid, "transactions");
  const q = query(ref, orderBy("date", "desc"));
  stopListening = onSnapshot(q, snapshot => {
    transactions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    render();
    setMessage("dataMessage", "");
  }, error => {
    setMessage("dataMessage", `Could not load data: ${error.message}`, true);
  });
}

function render() {
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
  $("transactionRows").innerHTML = visible.length ? visible.map(t => `
    <tr>
      <td>${escapeHtml(t.date || "")}</td>
      <td>${escapeHtml(t.description || (t.type === "payment" ? "Payment" : "Purchase"))}</td>
      <td><span class="type-pill">${t.type === "payment" ? "Payment" : "Purchase"}</span></td>
      <td class="right ${t.type === "payment" ? "amount-payment" : "amount-purchase"}">${t.type === "payment" ? "− " : "+ "}${money(Number(t.amount))}</td>
      <td class="right"><span class="row-actions">
        <button data-edit="${t.id}">Edit</button>
        <button class="delete" data-delete="${t.id}">Delete</button>
      </span></td>
    </tr>`).join("") : `<tr><td colspan="5" class="empty-state">No transactions found. Add your first purchase or payment.</td></tr>`;
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
  $("saveEntryBtn").textContent = editing ? "Save changes" : "Save entry";
  setMessage("formMessage", "");
  dialog.showModal();
}
$("addPurchaseBtn").addEventListener("click", () => openEntry("purchase"));
$("addPaymentBtn").addEventListener("click", () => openEntry("payment"));
$("closeDialogBtn").addEventListener("click", () => dialog.close());
$("cancelDialogBtn").addEventListener("click", () => dialog.close());

$("transactionForm").addEventListener("submit", async event => {
  event.preventDefault();
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
  const id = $("editId").value;
  $("saveEntryBtn").disabled = true;
  try {
    const ref = collection(db, "users", currentUser.uid, "transactions");
    if (id) await updateDoc(doc(ref, id), record);
    else await addDoc(ref, { ...record, createdAt: serverTimestamp() });
    dialog.close();
  } catch (error) {
    setMessage("formMessage", error.message || "Could not save this entry.", true);
  } finally {
    $("saveEntryBtn").disabled = false;
  }
});

$("transactionRows").addEventListener("click", async event => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) {
    const found = transactions.find(t => t.id === editId);
    if (found) openEntry(found.type, found);
  }
  if (deleteId) {
    const found = transactions.find(t => t.id === deleteId);
    if (!found) return;
    if (!confirm(`Delete "${found.description || found.type}" for ${money(found.amount)}?`)) return;
    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "transactions", deleteId));
    } catch (error) {
      setMessage("dataMessage", error.message || "Could not delete transaction.", true);
    }
  }
});

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
$("exportCsvBtn").addEventListener("click", () => {
  const month = selectedMonth();
  const rows = [
    ["Date", "Description", "Type", "Amount (INR)"],
    ...transactions.filter(t => (t.date || "").slice(0, 7) === month)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .map(t => [t.date, t.description || "", t.type, Number(t.amount).toFixed(2)])
  ];
  const csv = "\uFEFF" + rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kirana-ledger-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
