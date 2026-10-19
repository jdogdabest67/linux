(() => {
"use strict";
const $ = id => document.getElementById(id);
const API_BASE = "https://joygpt-signal-bridge.jdogdabest67.workers.dev";
const ACCOUNT_TOKEN_KEY = "jdogbrew-social-token-v1";
let accountToken = localStorage.getItem(ACCOUNT_TOKEN_KEY) || "";
let signedInUser = null;
let selectedAvatar = undefined;
const fallbackAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%23263848'/%3E%3Ctext x='50' y='62' font-size='44' text-anchor='middle' fill='%23e8f0f7'%3E%3F%3C/text%3E%3C/svg%3E";

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (accountToken) headers.Authorization = "Bearer " + accountToken;
  const response = await fetch(API_BASE + path, { ...options, headers, cache: "no-store" });
  let data;
  try { data = await response.json(); } catch (_) { throw Error("Server returned an unreadable response."); }
  if (!response.ok || data.ok === false) throw Error(data.error || ("Request failed (" + response.status + ")."));
  return data;
}
function setAccount(user) {
  signedInUser = user;
  $("accountStatus").textContent = user ? "Signed in as @" + user.username + "." : "Not signed in.";
  $("logoutAccount").disabled = !user;
  $("signedOutAccount").hidden = !!user;
  $("signedInProfile").hidden = !user;
  document.querySelectorAll("[data-account-nav]").forEach(button => { button.textContent = user ? "🪪 Profile" : "👤 Account"; });
  $("publishPost").disabled = !user;
  $("saveProfile").disabled = !user;
  $("clearAvatar").disabled = !user;
  updateNotificationStatus();
}
async function restoreAccount() {
  if (!accountToken) { setAccount(null); return; }
  try { setAccount((await api("/api/me")).user); await loadMyProfile(); }
  catch (_) { accountToken = ""; localStorage.removeItem(ACCOUNT_TOKEN_KEY); setAccount(null); }
}
async function accountAction(mode) {
  const username = $("accountUsername").value.trim(), password = $("accountPassword").value;
  if (!username || !password) { $("accountStatus").textContent = "Enter a username and password first."; return; }
  try {
    $("accountStatus").textContent = mode === "register" ? "Creating account…" : "Signing in…";
    const data = await api(mode === "register" ? "/api/register" : "/api/login", {method:"POST",body:JSON.stringify({username,password})});
    accountToken = data.token; localStorage.setItem(ACCOUNT_TOKEN_KEY, accountToken);
    setAccount(data.user); $("accountPassword").value = "";
    $("accountStatus").textContent = "Welcome, @" + data.user.username + "!";
    if (window.jdbSelectSection) window.jdbSelectSection("account");
    await loadMyProfile(); await loadPosts();
  } catch (e) { $("accountStatus").textContent = e.message; }
}
function applyMyProfile(p) {
  $("myDisplayName").textContent = p.displayName || p.username;
  $("myUsername").textContent = "@" + p.username;
  $("myAvatar").src = p.avatar || fallbackAvatar;
  $("myFollowers").textContent = p.followers;
  $("myFollowing").textContent = p.following;
  $("profileDisplayName").value = p.displayName || "";
  $("profileBio").value = p.bio || "";
}
async function loadMyProfile() {
  if (!signedInUser) return;
  try { const d = await api("/api/profile"); applyMyProfile(d.profile); $("profileStatus").textContent = "Profile loaded."; }
  catch (e) { $("profileStatus").textContent = e.message; }
}
async function resizeAvatar(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw Error("Choose a PNG, JPEG, or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw Error("Choose an image smaller than 8 MB.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas"), max = 256;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.78);
}
async function saveProfile() {
  if (!signedInUser) { $("profileStatus").textContent = "Sign in first."; return; }
  try {
    $("saveProfile").disabled = true; $("profileStatus").textContent = "Saving profile…";
    const payload = {displayName:$("profileDisplayName").value, bio:$("profileBio").value};
    if (selectedAvatar !== undefined) payload.avatar = selectedAvatar;
    const d = await api("/api/profile", {method:"POST",body:JSON.stringify(payload)});
    applyMyProfile(d.profile); selectedAvatar = undefined; $("profileAvatar").value = "";
    $("profileStatus").textContent = "Profile saved!";
  } catch(e) { $("profileStatus").textContent = e.message; }
  finally { $("saveProfile").disabled = !signedInUser; }
}
function renderProfile(p) {
  const root = $("profileResult"); root.replaceChildren();
  const card = document.createElement("div"); card.className = "profile-top";
  const img = document.createElement("img"); img.className = "avatar"; img.alt = "Profile picture"; img.src = p.avatar || fallbackAvatar;
  const details = document.createElement("div");
  const name = document.createElement("h2"); name.textContent = p.displayName || p.username;
  const handle = document.createElement("p"); handle.className = "small"; handle.textContent = "@" + p.username;
  const bio = document.createElement("p"); bio.textContent = p.bio || "This user hasn't written a bio yet.";
  const stats = document.createElement("div"); stats.className = "profile-stats";
  const followers = document.createElement("span"); followers.innerHTML = "<strong></strong> followers"; followers.querySelector("strong").textContent = p.followers;
  const following = document.createElement("span"); following.innerHTML = "<strong></strong> following"; following.querySelector("strong").textContent = p.following;
  stats.append(followers, following); details.append(name,handle,bio,stats); card.append(img,details); root.append(card);
  if (signedInUser && !p.isSelf) {
    const actions = document.createElement("div"); actions.className = "profile-actions";
    const button = document.createElement("button"); button.className = "primary"; button.textContent = p.isFollowing ? "Unfollow" : "Follow";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await api("/api/follow", {method:"POST",body:JSON.stringify({username:p.username,action:p.isFollowing?"unfollow":"follow"})});
        updateLocalFollow(p.username, !p.isFollowing);
        renderProfile(result.profile); await loadMyProfile(); renderNotifications();
      } catch(e) { $("profileResult").append(document.createTextNode(e.message)); }
      finally { button.disabled = false; }
    });
    actions.append(button); root.append(actions);
  } else if (!signedInUser) {
    const hint = document.createElement("p"); hint.className = "small"; hint.textContent = "Sign in to follow people."; root.append(hint);
  }
}
async function lookupProfile() {
  const username = $("profileLookup").value.trim();
  if (!username) { $("profileResult").textContent = "Enter a username first."; return; }
  try { $("profileResult").textContent = "Loading profile…"; renderProfile((await api("/api/profile/" + encodeURIComponent(username))).profile); }
  catch(e) { $("profileResult").textContent = e.message; }
}
const DRAFT_KEY = "jdogbrew-social-post-draft-v1";
const POST_EXTRA_PREFIX = "[[JDB_EXTRA:";
const POST_EXTRA_SUFFIX = "]]";
let cachedPosts = [];
const profileCache = new Map();
function getPostExtras(raw) {
  const start = raw.lastIndexOf(POST_EXTRA_PREFIX);
  if (start < 0 || !raw.endsWith(POST_EXTRA_SUFFIX)) return {text:raw, extras:null};
  const encoded = raw.slice(start + POST_EXTRA_PREFIX.length, -POST_EXTRA_SUFFIX.length);
  try { return {text:raw.slice(0,start), extras:JSON.parse(decodeURIComponent(encoded))}; }
  catch (_) { return {text:raw, extras:null}; }
}
function getProfileCached(username) {
  if (!profileCache.has(username)) {
    const request = api("/api/profile/" + encodeURIComponent(username)).then(d=>d.profile).catch(()=>null);
    profileCache.set(username, request);
  }
  return profileCache.get(username);
}
function postKey(post) { return String(post.id || (post.username + "|" + post.createdAt + "|" + post.content)); }
function encodePostContent() {
  const text = $("postComposer").value.trim();
  const imageUrl = $("postImageUrl").value.trim();
  let extras = null;
  if (imageUrl) {
    let parsed;
    try { parsed = new URL(imageUrl); } catch (_) { throw Error("Enter a valid image URL."); }
    if (!["http:","https:"].includes(parsed.protocol)) throw Error("Image URLs must start with http:// or https://.");
    extras = {imageUrl:parsed.href};
  }
  if (!text && !extras) throw Error("Write something or attach an image first.");
  const content = text + (extras ? POST_EXTRA_PREFIX + encodeURIComponent(JSON.stringify(extras)) + POST_EXTRA_SUFFIX : "");
  if (content.length > 1000) throw Error("This post is too large for the current server limit. Shorten the text or image URL.");
  return content;
}
function updateComposerMeta() {
  const count = $("postComposer").value.length;
  $("postCharCount").textContent = count + " / 1000";
  $("postCharCount").className = count > 900 ? "count-near-limit" : "";
}
function renderPosts() {
  const area = $("postFeed");
  const query = $("postSearch").value.trim().toLowerCase();
  const order = $("postSort").value;
  const posts = cachedPosts.filter(post => (getPostExtras(post.content || "").text + " " + post.username).toLowerCase().includes(query));
  posts.sort((a,b) => {
    const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return order === "oldest" ? delta : -delta;
  });
  area.replaceChildren();
  $("postCount").textContent = posts.length + (posts.length === 1 ? " post shown" : " posts shown") + (query ? " · filtered" : "");
  if (!posts.length) {
    const empty = document.createElement("div"); empty.className = "empty";
    empty.textContent = cachedPosts.length ? "No posts match that search. Try another word." : "No posts yet. Be the first to publish one!";
    area.append(empty); return;
  }
  for (const post of posts) {
    const parsed = getPostExtras(post.content || "");
    const card = document.createElement("article"); card.className = "bubble";
    const head = document.createElement("div"); head.className = "bubble-head";
    const author = document.createElement("div"); author.className = "post-author";
    const avatar = document.createElement("img"); avatar.className = "avatar small-avatar"; avatar.alt = "@" + post.username + " profile picture"; avatar.src = fallbackAvatar;
    const authorName = document.createElement("div"); authorName.className = "post-author-name";
    const who = document.createElement("button"); who.type = "button"; who.textContent = "@" + post.username;
    who.setAttribute("aria-label", "View @" + post.username + "'s profile");
    who.addEventListener("click", () => { $("profileLookup").value = post.username; lookupProfile(); $("profileResult").scrollIntoView({behavior:"smooth",block:"center"}); });
    const displayName = document.createElement("span"); displayName.className = "small"; displayName.textContent = post.username;
    authorName.append(who);
    author.append(avatar,authorName);
    const time = document.createElement("time"); const date = new Date(post.createdAt);
    time.textContent = date.toLocaleString(); time.title = date.toLocaleString();
    const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "Copy text";
    copy.addEventListener("click", async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(parsed.text); $("postStatus").textContent = "Post text copied."; }
        else { $("postStatus").textContent = "Copy isn't available in this browser. You can select the post text manually."; }
      } catch (_) { $("postStatus").textContent = "Copy wasn't available. You can select the post text manually."; }
    });
    head.append(author,time,copy);
    const body = document.createElement("div"); body.className = "bubble-body"; body.textContent = parsed.text;
    card.append(head,body);
    getProfileCached(post.username).then(profile => { if (profile && profile.avatar && avatar.isConnected) avatar.src = profile.avatar; });
    if (parsed.extras && parsed.extras.imageUrl) {
      try {
        const url = new URL(parsed.extras.imageUrl);
        if (["http:","https:"].includes(url.protocol)) {
          const image = document.createElement("img"); image.className = "post-media"; image.loading = "lazy"; image.alt = "Image attached to post"; image.src = url.href;
          image.addEventListener("error",()=>{ image.alt="Attached image could not be loaded."; image.removeAttribute("src"); image.style.minHeight="0"; });
          card.append(image);
        }
      } catch (_) {}
    }
    area.append(card);
  }
}
const FOLLOWED_USERS_KEY = "jdogbrew-follow-notifications-users-v1";
const SEEN_NOTIFICATION_KEYS = "jdogbrew-follow-notifications-seen-v1";
function readLocalList(key) {
  try { const value=JSON.parse(localStorage.getItem(key)||"[]"); return Array.isArray(value)?value:[]; }
  catch (_) { return []; }
}
function updateLocalFollow(username, following) {
  const users=readLocalList(FOLLOWED_USERS_KEY), lower=String(username).toLowerCase();
  const next=users.filter(name=>String(name).toLowerCase()!==lower);
  if (following) next.push(username);
  localStorage.setItem(FOLLOWED_USERS_KEY,JSON.stringify(next));
  if (following) {
    const seen=readLocalList(SEEN_NOTIFICATION_KEYS);
    cachedPosts.filter(post=>String(post.username).toLowerCase()===lower).forEach(post=>seen.push(postKey(post)));
    localStorage.setItem(SEEN_NOTIFICATION_KEYS,JSON.stringify([...new Set(seen)]));
  }
  updateNotificationStatus();
}
function updateNotificationStatus() {
  const status=$("notificationStatus"); if (!status) return;
  if (!signedInUser) { status.textContent="Sign in and follow people to start seeing updates here."; return; }
  const users=readLocalList(FOLLOWED_USERS_KEY);
  status.textContent=users.length ? "Watching posts from: "+users.map(name=>"@"+name).join(", ")+". Updates are checked when the feed refreshes." : "Follow someone from Find people to start tracking their new posts on this device.";
}
function renderNotifications() {
  const area=$("notificationFeed"); if (!area) return;
  area.replaceChildren();
  const users=readLocalList(FOLLOWED_USERS_KEY).map(name=>String(name).toLowerCase());
  const seen=new Set(readLocalList(SEEN_NOTIFICATION_KEYS));
  if (!signedInUser || !users.length) {
    const empty=document.createElement("div"); empty.className="empty"; empty.textContent=!signedInUser ? "Sign in to see updates from followed accounts." : "No followed accounts tracked yet. Find a person and follow them first.";
    area.append(empty); updateNotificationStatus(); return;
  }
  const followedPosts=cachedPosts.filter(post=>users.includes(String(post.username).toLowerCase())).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const unread=followedPosts.filter(post=>!seen.has(postKey(post)));
  if (!unread.length) {
    const empty=document.createElement("div"); empty.className="empty"; empty.textContent="You're all caught up. No new posts from the people you follow."; area.append(empty);
    updateNotificationStatus(); return;
  }
  unread.forEach(post=>{
    const card=document.createElement("article"); card.className="bubble";
    const head=document.createElement("div"); head.className="bubble-head";
    const who=document.createElement("strong"); who.textContent="@"+post.username+" posted";
    const time=document.createElement("time"); time.textContent=new Date(post.createdAt).toLocaleString();
    head.append(who,time);
    const body=document.createElement("div"); body.className="bubble-body"; body.textContent=getPostExtras(post.content||"").text;
    card.append(head,body);
    const extras=getPostExtras(post.content||"").extras;
    if (extras && extras.imageUrl) {
      try { const url=new URL(extras.imageUrl); if (["http:","https:"].includes(url.protocol)) { const image=document.createElement("img"); image.className="post-media"; image.loading="lazy"; image.alt="Image attached to post"; image.src=url.href; card.append(image); } } catch (_) {}
    }
    area.append(card);
  });
  updateNotificationStatus();
}
function markNotificationsSeen() {
  const users=readLocalList(FOLLOWED_USERS_KEY).map(name=>String(name).toLowerCase());
  const seen=new Set(readLocalList(SEEN_NOTIFICATION_KEYS));
  cachedPosts.filter(post=>users.includes(String(post.username).toLowerCase())).forEach(post=>seen.add(postKey(post)));
  localStorage.setItem(SEEN_NOTIFICATION_KEYS,JSON.stringify([...seen]));
  renderNotifications();
  $("notificationStatus").textContent="All currently loaded followed-user posts marked as seen.";
}
async function loadPosts() {
  const area = $("postFeed");
  area.replaceChildren(); const loading = document.createElement("div"); loading.className = "empty"; loading.textContent = "Fetching fresh posts…"; area.append(loading);
  try { const data = await api("/api/posts"); cachedPosts = Array.isArray(data.posts) ? data.posts : []; renderPosts(); renderNotifications(); }
  catch(e) { cachedPosts = []; area.replaceChildren(); const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Couldn't load posts: " + e.message; area.append(empty); $("postCount").textContent = "Feed unavailable"; }
}
async function publishPost() {
  if (!signedInUser) { $("postStatus").textContent="Sign in first to publish."; return; }
  let content;
  try { content=encodePostContent(); } catch(e) { $("postStatus").textContent=e.message; return; }
  try { $("publishPost").disabled=true; $("postStatus").textContent="Publishing…"; await api("/api/posts",{method:"POST",body:JSON.stringify({content})}); $("postComposer").value=""; $("postImageUrl").value=""; localStorage.removeItem(DRAFT_KEY); updateComposerMeta(); $("draftStatus").textContent="Draft cleared after publishing."; $("postStatus").textContent="Posted! Saved on the server."; await loadPosts(); }
  catch(e){$("postStatus").textContent=e.message;}
  finally{$("publishPost").disabled=!signedInUser;}
}

function logOut() { accountToken=""; localStorage.removeItem(ACCOUNT_TOKEN_KEY); setAccount(null); $("accountStatus").textContent="Signed out on this device."; $("profileStatus").textContent="Sign in to edit your profile."; if (window.jdbSelectSection) window.jdbSelectSection("account"); }
$("logoutAccount").addEventListener("click",logOut);
$("profileLogout").addEventListener("click",logOut);
$("publishPost").addEventListener("click",publishPost);
$("refreshPosts").addEventListener("click",loadPosts);
$("refreshNotifications").addEventListener("click",loadPosts);
$("clearNotifications").addEventListener("click",markNotificationsSeen);
$("postComposer").value = localStorage.getItem(DRAFT_KEY) || "";
updateComposerMeta();
$("postComposer").addEventListener("input", () => {
  updateComposerMeta();
  try { localStorage.setItem(DRAFT_KEY, $("postComposer").value); $("draftStatus").textContent = $("postComposer").value ? "Draft saved on this device." : "Drafts save on this device."; }
  catch (_) { $("draftStatus").textContent = "Draft saving isn't available in this browser."; }
});
$("postComposer").addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") publishPost(); });
$("clearDraft").addEventListener("click", () => {
  $("postComposer").value = ""; localStorage.removeItem(DRAFT_KEY); updateComposerMeta();
  $("draftStatus").textContent = "Draft cleared."; $("postStatus").textContent = "Your draft was cleared. No post was published.";
  $("postComposer").focus();
});
$("postSearch").addEventListener("input", renderPosts);
$("postSort").addEventListener("change", renderPosts);
$("saveProfile").addEventListener("click",saveProfile);
$("lookupProfile").addEventListener("click",lookupProfile);
$("profileLookup").addEventListener("keydown",e=>{if(e.key==="Enter")lookupProfile();});
$("profileAvatar").addEventListener("change",async e=>{
  const file=e.target.files && e.target.files[0]; if(!file)return;
  try { selectedAvatar=await resizeAvatar(file); $("myAvatar").src=selectedAvatar; $("profileStatus").textContent="Picture ready. Save profile to publish it."; }
  catch(err){selectedAvatar=undefined;$("profileStatus").textContent=err.message;e.target.value="";}
});
$("clearAvatar").addEventListener("click",()=>{selectedAvatar=null;$("myAvatar").src=fallbackAvatar;$("profileAvatar").value="";$("profileStatus").textContent="Picture will be removed when you save.";});
setAccount(null); renderNotifications(); loadPosts(); restoreAccount();
})();