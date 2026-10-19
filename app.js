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
const DRAFT_KEY = "jdogbrew-social-post-draft-v1";
const POLL_VOTES_KEY = "jdogbrew-social-poll-votes-v1";
const POST_EXTRA_PREFIX = "\\n\\n[[JDB_EXTRA:";
const POST_EXTRA_SUFFIX = "]]";
let cachedPosts = [];
const profileCache = new Map();
function getPostExtras(raw) {
  const start = raw.lastIndexOf("\\n\\n[[JDB_EXTRA:");
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
function readPollVotes() {
  try { return JSON.parse(localStorage.getItem(POLL_VOTES_KEY) || "{}"); } catch (_) { return {}; }
}
function writePollVote(key, optionIndex) {
  const votes = readPollVotes(); votes[key] = optionIndex;
  try { localStorage.setItem(POLL_VOTES_KEY, JSON.stringify(votes)); } catch (_) {}
}
function postKey(post) { return String(post.id || (post.username + "|" + post.createdAt + "|" + post.content)); }
function encodePostContent() {
  const text = $("postComposer").value.trim();
  const imageUrl = $("postImageUrl").value.trim();
  const question = $("pollQuestion").value.trim();
  const option1 = $("pollOption1").value.trim();
  const option2 = $("pollOption2").value.trim();
  let extras = null;
  if (imageUrl) {
    let parsed;
    try { parsed = new URL(imageUrl); } catch (_) { throw Error("Enter a valid image URL."); }
    if (!["http:","https:"].includes(parsed.protocol)) throw Error("Image URLs must start with http:// or https://.");
    extras = {imageUrl:parsed.href};
  }
  if (question || option1 || option2) {
    if (!question || !option1 || !option2) throw Error("A poll needs a question and two options.");
    extras = {...(extras || {}), poll:{question,options:[option1,option2]}};
  }
  if (!text && !extras) throw Error("Write something, attach an image, or create a poll first.");
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
    if (parsed.extras && parsed.extras.poll && Array.isArray(parsed.extras.poll.options) && parsed.extras.poll.options.length >= 2) {
      const poll = parsed.extras.poll, pollKey = postKey(post), votes = readPollVotes(), selected = votes[pollKey];
      const pollBox = document.createElement("div"); pollBox.className = "poll-card";
      const question = document.createElement("strong"); question.textContent = poll.question || "Poll";
      pollBox.append(question);
      const counts = Array.isArray(poll.options) ? poll.options.map((_,i)=>selected===i?1:0) : [];
      const total = counts.reduce((sum,n)=>sum+n,0);
      poll.options.slice(0,4).forEach((option,index)=>{
        const choice = document.createElement("button"); choice.type="button"; choice.className="poll-choice"+(selected===index?" selected":""); choice.disabled=selected!==undefined;
        const label=document.createElement("span"); label.textContent=option;
        const percent=document.createElement("span"); percent.className="poll-percent"; percent.textContent=selected===index?"Your vote":"";
        choice.append(label,percent);
        choice.addEventListener("click",()=>{writePollVote(pollKey,index);renderPosts();});
        pollBox.append(choice);
      });
      const meta=document.createElement("div"); meta.className="poll-meta"; meta.textContent=selected===undefined?"Choose one option to vote. Votes are stored on this device only.":"Vote saved on this device.";
      pollBox.append(meta); card.append(pollBox);
    }
    area.append(card);
  }
}
async function loadPosts() {
  const area = $("postFeed");
  area.replaceChildren(); const loading = document.createElement("div"); loading.className = "empty"; loading.textContent = "Fetching fresh posts…"; area.append(loading);
  try { const data = await api("/api/posts"); cachedPosts = Array.isArray(data.posts) ? data.posts : []; renderPosts(); }
  catch(e) { cachedPosts = []; area.replaceChildren(); const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Couldn't load posts: " + e.message; area.append(empty); $("postCount").textContent = "Feed unavailable"; }
}
async function publishPost() {
  if (!signedInUser) { $("postStatus").textContent="Sign in first to publish."; return; }
  let content;
  try { content=encodePostContent(); } catch(e) { $("postStatus").textContent=e.message; return; }
  try { $("publishPost").disabled=true; $("postStatus").textContent="Publishing…"; await api("/api/posts",{method:"POST",body:JSON.stringify({content})}); $("postComposer").value=""; $("postImageUrl").value=""; $("pollQuestion").value=""; $("pollOption1").value=""; $("pollOption2").value=""; localStorage.removeItem(DRAFT_KEY); updateComposerMeta(); $("draftStatus").textContent="Draft cleared after publishing."; $("postStatus").textContent="Posted! Saved on the server."; await loadPosts(); }
  catch(e){$("postStatus").textContent=e.message;}
  finally{$("publishPost").disabled=!signedInUser;}
}
$("registerAccount").addEventListener("click",()=>accountAction("register"));
$("loginAccount").addEventListener("click",()=>accountAction("login"));
$("logoutAccount").addEventListener("click",()=>{accountToken="";localStorage.removeItem(ACCOUNT_TOKEN_KEY);setAccount(null);$("accountStatus").textContent="Signed out on this device.";});
$("publishPost").addEventListener("click",publishPost);
$("refreshPosts").addEventListener("click",loadPosts);
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
setAccount(null); loadPosts(); restoreAccount();
})();