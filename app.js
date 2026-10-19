(() => {
"use strict";
const $ = id => document.getElementById(id);
const API_BASE = "https://joygpt-signal-bridge.jdogdabest67.workers.dev";
const ACCOUNT_TOKEN_KEY = "jdogbrew-social-token-v1";
let accountToken = localStorage.getItem(ACCOUNT_TOKEN_KEY) || "";
let signedInUser = null;

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (accountToken) headers.Authorization = "Bearer " + accountToken;
  const response = await fetch(API_BASE + path, { ...options, headers, cache: "no-store" });
  let data;
  try { data = await response.json(); }
  catch (_) { throw Error("Server returned an unreadable response."); }
  if (!response.ok || data.ok === false) throw Error(data.error || ("Request failed (" + response.status + ")."));
  return data;
}

function setAccount(user) {
  signedInUser = user;
  $("accountStatus").textContent = user ? "Signed in as @" + user.username + "." : "Not signed in.";
  $("logoutAccount").disabled = !user;
  $("publishPost").disabled = !user;
}

async function restoreAccount() {
  if (!accountToken) { setAccount(null); return; }
  try {
    const data = await api("/api/me");
    setAccount(data.user);
  } catch (_) {
    accountToken = "";
    localStorage.removeItem(ACCOUNT_TOKEN_KEY);
    setAccount(null);
  }
}

async function accountAction(mode) {
  const username = $("accountUsername").value.trim();
  const password = $("accountPassword").value;
  const status = $("accountStatus");
  if (!username || !password) {
    status.textContent = "Enter a username and password first.";
    return;
  }
  try {
    status.textContent = mode === "register" ? "Creating account…" : "Signing in…";
    const data = await api(mode === "register" ? "/api/register" : "/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    accountToken = data.token;
    localStorage.setItem(ACCOUNT_TOKEN_KEY, accountToken);
    setAccount(data.user);
    $("accountPassword").value = "";
    status.textContent = "Welcome, @" + data.user.username + "!";
    await loadPosts();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function loadPosts() {
  const area = $("postFeed");
  try {
    const data = await api("/api/posts");
    area.replaceChildren();
    if (!data.posts.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No posts yet. Be the first to publish one!";
      area.append(empty);
      return;
    }
    for (const post of data.posts) {
      const card = document.createElement("article");
      card.className = "bubble";
      const head = document.createElement("div");
      head.className = "bubble-head";
      const who = document.createElement("strong");
      who.textContent = "@" + post.username;
      const time = document.createElement("time");
      time.textContent = new Date(post.createdAt).toLocaleString();
      head.append(who, time);
      const body = document.createElement("div");
      body.className = "bubble-body";
      body.textContent = post.content;
      card.append(head, body);
      area.append(card);
    }
  } catch (error) {
    area.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Couldn't load posts: " + error.message;
    area.append(empty);
  }
}

async function publishPost() {
  if (!signedInUser) {
    $("postStatus").textContent = "Sign in first to publish.";
    return;
  }
  const content = $("postComposer").value.trim();
  if (!content) {
    $("postStatus").textContent = "Write something first.";
    return;
  }
  try {
    $("publishPost").disabled = true;
    $("postStatus").textContent = "Publishing…";
    await api("/api/posts", { method: "POST", body: JSON.stringify({ content }) });
    $("postComposer").value = "";
    $("postStatus").textContent = "Posted! Saved on the server.";
    await loadPosts();
  } catch (error) {
    $("postStatus").textContent = error.message;
  } finally {
    $("publishPost").disabled = !signedInUser;
  }
}

$("registerAccount").addEventListener("click", () => accountAction("register"));
$("loginAccount").addEventListener("click", () => accountAction("login"));
$("logoutAccount").addEventListener("click", () => {
  accountToken = "";
  localStorage.removeItem(ACCOUNT_TOKEN_KEY);
  setAccount(null);
  $("accountStatus").textContent = "Signed out on this device.";
});
$("publishPost").addEventListener("click", publishPost);
$("refreshPosts").addEventListener("click", loadPosts);
$("logoutAccount").disabled = true;
$("publishPost").disabled = true;
restoreAccount();
loadPosts();
})();
