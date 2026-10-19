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
  $("publishPost").disabled = !user;
  $("saveProfile").disabled = !user;
  $("clearAvatar").disabled = !user;
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
        renderProfile(result.profile); await loadMyProfile();
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
async function loadPosts() {
  const area = $("postFeed");
  try {
    const data = await api("/api/posts"); area.replaceChildren();
    if (!data.posts.length) { const empty=document.createElement("div"); empty.className="empty"; empty.textContent="No posts yet. Be the first to publish one!"; area.append(empty); return; }
    for (const post of data.posts) {
      const card=document.createElement("article"); card.className="bubble";
      const head=document.createElement("div"); head.className="bubble-head";
      const who=document.createElement("button"); who.textContent="@"+post.username; who.addEventListener("click",()=>{$("profileLookup").value=post.username;lookupProfile();$("profileResult").scrollIntoView({behavior:"smooth",block:"center"});});
      const time=document.createElement("time"); time.textContent=new Date(post.createdAt).toLocaleString();
      head.append(who,time); const body=document.createElement("div"); body.className="bubble-body"; body.textContent=post.content; card.append(head,body); area.append(card);
    }
  } catch(e) { area.replaceChildren(); const empty=document.createElement("div"); empty.className="empty"; empty.textContent="Couldn't load posts: "+e.message; area.append(empty); }
}
async function publishPost() {
  if (!signedInUser) { $("postStatus").textContent="Sign in first to publish."; return; }
  const content=$("postComposer").value.trim(); if(!content){$("postStatus").textContent="Write something first.";return;}
  try { $("publishPost").disabled=true; $("postStatus").textContent="Publishing…"; await api("/api/posts",{method:"POST",body:JSON.stringify({content})}); $("postComposer").value=""; $("postStatus").textContent="Posted! Saved on the server."; await loadPosts(); }
  catch(e){$("postStatus").textContent=e.message;}
  finally{$("publishPost").disabled=!signedInUser;}
}
$("registerAccount").addEventListener("click",()=>accountAction("register"));
$("loginAccount").addEventListener("click",()=>accountAction("login"));
$("logoutAccount").addEventListener("click",()=>{accountToken="";localStorage.removeItem(ACCOUNT_TOKEN_KEY);setAccount(null);$("accountStatus").textContent="Signed out on this device.";});
$("publishPost").addEventListener("click",publishPost);
$("refreshPosts").addEventListener("click",loadPosts);
$("saveProfile").addEventListener("click",saveProfile);
$("lookupProfile").addEventListener("click",lookupProfile);
$("profileLookup").addEventListener("keydown",e=>{if(e.key==="Enter")lookupProfile();});
$("profileAvatar").addEventListener("change",async e=>{
  const file=e.target.files && e.target.files[0]; if(!file)return;
  try { selectedAvatar=await resizeAvatar(file); $("myAvatar").src=selectedAvatar; $("profileStatus").textContent="Picture ready. Save profile to publish it."; }
  catch(err){selectedAvatar=undefined;$("profileStatus").textContent=err.message;e.target.value="";}
});
$("clearAvatar").addEventListener("click",()=>{selectedAvatar=null;$("myAvatar").src=fallbackAvatar;$("profileAvatar").value="";$("profileStatus").textContent="Picture will be removed when you save.";});
setAccount(null); loadPosts(); restoreAccount();
})();