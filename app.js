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
  if (user) { loadNotifications(); loadBlockedUsers(); } else { loadBlockedUsers(); }
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
    await loadMyProfile(); await loadPosts(); await loadNotifications();
  } catch (e) { $("accountStatus").textContent = e.message; }
}
function updateBannerPreview() {
  const url = $("profileBannerUrl").value.trim(), preview = $("myBannerPreview");
  let valid = false;
  try { const parsed = new URL(url); valid = ["http:", "https:"].includes(parsed.protocol); } catch (_) {}
  preview.hidden = !valid;
  preview.style.backgroundImage = valid ? "url(" + JSON.stringify(url) + ")" : "";
}
function applyMyProfile(p) {
  $("myDisplayName").textContent = p.displayName || p.username;
  $("myUsername").textContent = "@" + p.username;
  $("myAvatar").src = p.avatar || fallbackAvatar;
  $("myFollowers").textContent = p.followers;
  $("myFollowing").textContent = p.following;
  $("profileDisplayName").value = p.displayName || "";
  $("profileBio").value = p.bio || "";
  $("profilePronouns").value = p.pronouns || "";
  $("profileFavoriteGame").value = p.favoriteGame || "";
  $("profileAccent").value = p.accent || "#a78bfa";
  $("profileBannerUrl").value = p.bannerUrl || "";
  const banner = $("myBanner"); banner.hidden = !p.bannerUrl; banner.style.backgroundImage = p.bannerUrl ? "url(" + JSON.stringify(p.bannerUrl) + ")" : "";
  $("myProfilePanel").style.setProperty("--profile-accent", p.accent || "#a78bfa");
  $("myAvatar").style.borderColor = p.accent || "#a78bfa";
  updateBannerPreview();
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
    const payload = {displayName:$("profileDisplayName").value, bio:$("profileBio").value, pronouns:$("profilePronouns").value, favoriteGame:$("profileFavoriteGame").value, accent:$("profileAccent").value, bannerUrl:$("profileBannerUrl").value.trim()};
    if (selectedAvatar !== undefined) payload.avatar = selectedAvatar;
    const d = await api("/api/profile", {method:"POST",body:JSON.stringify(payload)});
    applyMyProfile(d.profile); selectedAvatar = undefined; $("profileAvatar").value = "";
    $("profileStatus").textContent = "Profile saved!";
  } catch(e) { $("profileStatus").textContent = e.message; }
  finally { $("saveProfile").disabled = !signedInUser; }
}
function renderProfile(p) {
  const root = $("profileResult"); root.replaceChildren();
  const banner = document.createElement("div"); banner.className = "profile-public-banner"; banner.hidden = !p.bannerUrl; if (p.bannerUrl) banner.style.backgroundImage = "url(" + JSON.stringify(p.bannerUrl) + ")"; root.append(banner);
  const card = document.createElement("div"); card.className = "profile-top";
  const img = document.createElement("img"); img.className = "avatar"; img.alt = "Profile picture"; img.src = p.avatar || fallbackAvatar; img.style.borderColor = p.accent || "#a78bfa";
  const details = document.createElement("div");
  const name = document.createElement("h2"); name.textContent = p.displayName || p.username;
  const handle = document.createElement("p"); handle.className = "small"; handle.textContent = "@" + p.username;
  const bio = document.createElement("p"); bio.textContent = p.bio || "This user hasn't written a bio yet.";
  const stats = document.createElement("div"); stats.className = "profile-stats";
  const followers = document.createElement("span"); followers.innerHTML = "<strong></strong> followers"; followers.querySelector("strong").textContent = p.followers;
  const following = document.createElement("span"); following.innerHTML = "<strong></strong> following"; following.querySelector("strong").textContent = p.following;
  stats.append(followers, following); details.append(name,handle,bio); const extra = document.createElement("p"); extra.className = "small"; extra.textContent = [p.pronouns, p.favoriteGame ? "Favorite game: " + p.favoriteGame : ""].filter(Boolean).join(" · "); if (extra.textContent) details.append(extra); details.append(stats); card.append(img,details); root.append(card);
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
function updateImagePreview() {
  const input = $("postImageUrl"), box = $("imagePreview"), image = $("imagePreviewImg"), status = $("imagePreviewStatus");
  const raw = input.value.trim();
  if (!raw) { box.hidden = true; image.removeAttribute("src"); status.textContent = "Image preview"; return; }
  let url;
  try { url = new URL(raw); } catch (_) { box.hidden = true; image.removeAttribute("src"); return; }
  if (!["http:", "https:"].includes(url.protocol)) { box.hidden = true; image.removeAttribute("src"); return; }
  box.hidden = false; status.textContent = "Loading image preview…"; image.src = url.href;
}
function relativeTime(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return date.toLocaleString();
  if (seconds < 45) return "just now";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
  if (seconds < 604800) return Math.floor(seconds / 86400) + "d ago";
  return date.toLocaleDateString();
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
    time.textContent = relativeTime(date); time.className = "timestamp-relative"; time.title = date.toLocaleString(); time.dateTime = date.toISOString();
    const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "Copy text";
    copy.addEventListener("click", async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(parsed.text); $("postStatus").textContent = "Post text copied."; }
        else { $("postStatus").textContent = "Copy isn't available in this browser. You can select the post text manually."; }
      } catch (_) { $("postStatus").textContent = "Copy wasn't available. You can select the post text manually."; }
    });
    head.append(author,time,copy);
    if (signedInUser && String(signedInUser.username).toLowerCase() === String(post.username).toLowerCase() && post.id) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", "Delete your post");
      remove.addEventListener("click", async () => {
        if (!window.confirm("Delete this post permanently?")) return;
        remove.disabled = true;
        try {
          await api("/api/posts/" + encodeURIComponent(post.id), {method:"DELETE"});
          $("postStatus").textContent = "Post deleted.";
          await loadPosts();
        } catch (error) {
          $("postStatus").textContent = error.message;
          remove.disabled = false;
        }
      });
      head.append(remove);
    }
    const body = document.createElement("div"); body.className = "bubble-body"; body.textContent = parsed.text;
    card.dataset.postId=String(post.id||"");
    card.append(head,body);

    const tools = document.createElement("div"); tools.className="actions post-interactions";
    const react = document.createElement("button"); react.type="button"; react.textContent="♡ Like"; react.disabled=!signedInUser;
    const reactCount = document.createElement("span"); reactCount.className="small"; reactCount.textContent="Loading likes…";
    react.addEventListener("click",async()=>{react.disabled=true;try{const data=await api("/api/reactions",{method:"POST",body:JSON.stringify({postId:post.id})});react.textContent=data.reacted?"♥ Liked":"♡ Like";reactCount.textContent=data.count+" likes";react.classList.toggle("primary",data.reacted);await loadNotifications();}catch(e){$("postStatus").textContent=e.message;}finally{react.disabled=!signedInUser;}});
    if(post.id) api("/api/reactions?postId="+encodeURIComponent(post.id)).then(data=>{reactCount.textContent=data.count+" likes";react.textContent=data.reacted?"♥ Liked":"♡ Like";react.classList.toggle("primary",data.reacted);}).catch(()=>{reactCount.textContent="Likes unavailable";});
    tools.append(react,reactCount);
    const commentToggle=document.createElement("button");commentToggle.type="button";commentToggle.textContent="💬 Replies";tools.append(commentToggle);
    const comments=document.createElement("div");comments.className="post-comments";comments.hidden=true;
    const commentList=document.createElement("div");commentList.className="comment-list";commentList.textContent="Open replies to load them.";
    const replyBox=document.createElement("textarea");replyBox.rows=2;replyBox.maxLength=500;replyBox.placeholder="Write a reply (500 characters max)…";replyBox.hidden=!signedInUser;
    const replyActions=document.createElement("div");replyActions.className="actions";
    const sendReply=document.createElement("button");sendReply.type="button";sendReply.textContent="Reply";sendReply.disabled=!signedInUser;
    const commentStatus=document.createElement("p");commentStatus.className="small";commentStatus.setAttribute("aria-live","polite");
    const loadComments=async()=>{commentList.replaceChildren();const loading=document.createElement("div");loading.className="empty";loading.textContent="Loading replies…";commentList.append(loading);try{const data=await api("/api/comments?postId="+encodeURIComponent(post.id));commentList.replaceChildren();if(!data.comments.length){const empty=document.createElement("p");empty.className="small";empty.textContent="No replies yet. Start the conversation!";commentList.append(empty);}for(const comment of data.comments){const item=document.createElement("div");item.className="comment-item";const author=document.createElement("strong");author.textContent="@"+comment.username;const text=document.createElement("p");text.textContent=comment.content;const time=document.createElement("time");time.className="small";time.textContent=relativeTime(new Date(comment.createdAt));time.title=new Date(comment.createdAt).toLocaleString();item.append(author,text,time);commentList.append(item);}}catch(e){commentList.textContent=e.message;}};
    commentToggle.addEventListener("click",async()=>{comments.hidden=!comments.hidden;if(!comments.hidden){await loadComments();if(signedInUser)replyBox.focus();}});
    sendReply.addEventListener("click",async()=>{if(!signedInUser){commentStatus.textContent="Sign in to reply.";return;}const content=replyBox.value.trim();if(!content){commentStatus.textContent="Write a reply first.";return;}sendReply.disabled=true;try{await api("/api/comments",{method:"POST",body:JSON.stringify({postId:post.id,content})});replyBox.value="";commentStatus.textContent="Reply posted.";await loadComments();await loadNotifications();}catch(e){commentStatus.textContent=e.message;}finally{sendReply.disabled=!signedInUser;}});
    replyActions.append(sendReply);comments.append(commentList,replyBox,replyActions,commentStatus);tools.append(comments);
    if(signedInUser && String(signedInUser.username).toLowerCase()!==String(post.username).toLowerCase()){
      const more=document.createElement("details");more.className="post-safety";const summary=document.createElement("summary");summary.textContent="Report or block";more.append(summary);
      const report=document.createElement("button");report.type="button";report.textContent="Report post";
      report.addEventListener("click",async()=>{const reason=window.prompt("Why are you reporting this post? (Spam, harassment, unsafe content, etc.)");if(!reason||!reason.trim())return;try{const data=await api("/api/reports",{method:"POST",body:JSON.stringify({postId:post.id,reason:reason.trim()})});$("postStatus").textContent=data.message||"Report submitted.";report.disabled=true;}catch(e){$("postStatus").textContent=e.message;}});
      const block=document.createElement("button");block.type="button";block.textContent="Block @"+post.username;
      block.addEventListener("click",async()=>{if(!window.confirm("Block @"+post.username+"? Their posts and replies will be hidden from you, and yours from them."))return;try{await api("/api/blocks",{method:"POST",body:JSON.stringify({username:post.username,action:"block"})});$("postStatus").textContent="@"+post.username+" blocked.";await loadPosts();}catch(e){$("postStatus").textContent=e.message;}});
      more.append(report,block);tools.append(more);
    }
    card.append(tools);

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

let serverNotifications=[];

async function loadBlockedUsers(){
 const area=$("blockedUsersList");if(!area)return;area.replaceChildren();
 if(!signedInUser){const empty=document.createElement("div");empty.className="empty";empty.textContent="Sign in to manage blocked accounts.";area.append(empty);return;}
 try{
  const data=await api("/api/blocks"), users=data.users||[];
  if(!users.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="You haven't blocked anyone. The Duck remains uncontained.";area.append(empty);return;}
  for(const username of users){const row=document.createElement("div");row.className="bubble";const label=document.createElement("strong");label.textContent="@"+username;const button=document.createElement("button");button.type="button";button.textContent="Unblock";button.addEventListener("click",async()=>{button.disabled=true;try{await api("/api/blocks",{method:"POST",body:JSON.stringify({username,action:"unblock"})});await loadBlockedUsers();await loadPosts();}catch(e){$("profileResult").textContent=e.message;button.disabled=false;}});row.append(label,button);area.append(row);}
 }catch(e){const empty=document.createElement("div");empty.className="empty";empty.textContent=e.message;area.append(empty);}
}
async function loadNotifications(){
  const area=$("notificationFeed");if(!area)return;
  let direct=area.querySelector(".direct-notifications");
  if(!direct){direct=document.createElement("div");direct.className="direct-notifications";area.prepend(direct);}
  direct.replaceChildren();
  const heading=document.createElement("h3");heading.textContent="Direct interactions";direct.append(heading);
  if(!signedInUser){const p=document.createElement("p");p.className="empty";p.textContent="Sign in to receive replies and reaction notifications.";direct.append(p);return;}
  try{
    const data=await api("/api/notifications");serverNotifications=data.notifications||[];
    const unread=serverNotifications.filter(item=>!item.read);
    if(!serverNotifications.length){const p=document.createElement("p");p.className="small";p.textContent="No direct interactions yet. You'll only be notified when someone replies to or likes your post.";direct.append(p);return;}
    const mark=document.createElement("button");mark.type="button";mark.textContent="Mark direct notifications read";mark.disabled=!unread.length;
    mark.addEventListener("click",async()=>{mark.disabled=true;try{await api("/api/notifications/read",{method:"POST",body:JSON.stringify({})});serverNotifications=serverNotifications.map(item=>({...item,read:true}));await loadNotifications();}catch(e){$("notificationStatus").textContent=e.message;}});
    direct.append(mark);
    for(const item of serverNotifications){const card=document.createElement("article");card.className="bubble";const title=document.createElement("strong");title.textContent=(item.read?"":"● ")+"@"+item.actor+(item.type==="reply"?" replied to your post":" liked your post");const time=document.createElement("time");time.className="small";time.textContent=relativeTime(new Date(item.createdAt));const open=document.createElement("button");open.type="button";open.textContent="View post";open.addEventListener("click",()=>{if(window.jdbSelectSection)window.jdbSelectSection("posts");const target=document.querySelector('[data-post-id="'+item.postId+'"]');if(target)target.scrollIntoView({behavior:"smooth",block:"center"});});card.append(title,time,open);direct.append(card);}
  }catch(e){const p=document.createElement("p");p.className="small";p.textContent="Direct notifications unavailable: "+e.message;direct.append(p);}
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
  try { const data = await api("/api/posts"); cachedPosts = Array.isArray(data.posts) ? data.posts : []; renderPosts(); renderNotifications(); await loadNotifications(); }
  catch(e) { cachedPosts = []; area.replaceChildren(); const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Couldn't load posts: " + e.message; area.append(empty); $("postCount").textContent = "Feed unavailable"; }
}
async function publishPost() {
  if (!signedInUser) { $("postStatus").textContent="Sign in first to publish."; return; }
  let content;
  try { content=encodePostContent(); } catch(e) { $("postStatus").textContent=e.message; return; }
  try { $("publishPost").disabled=true; $("postStatus").textContent="Publishing…"; await api("/api/posts",{method:"POST",body:JSON.stringify({content})}); $("postComposer").value=""; $("postImageUrl").value=""; updateImagePreview(); localStorage.removeItem(DRAFT_KEY); updateComposerMeta(); $("draftStatus").textContent="Draft cleared after publishing."; $("postStatus").textContent="Posted! Saved on the server."; await loadPosts(); }
  catch(e){$("postStatus").textContent=e.message;}
  finally{$("publishPost").disabled=!signedInUser;}
}

function logOut() { accountToken=""; localStorage.removeItem(ACCOUNT_TOKEN_KEY); setAccount(null); $("accountStatus").textContent="Signed out on this device."; $("profileStatus").textContent="Sign in to edit your profile."; if (window.jdbSelectSection) window.jdbSelectSection("account"); }
$("registerAccount").addEventListener("click", () => accountAction("register"));
$("loginAccount").addEventListener("click", () => accountAction("login"));
$("logoutAccount").addEventListener("click",logOut);
$("profileLogout").addEventListener("click",logOut);
$("publishPost").addEventListener("click",publishPost);
$("refreshPosts").addEventListener("click",loadPosts);
$("refreshNotifications").addEventListener("click",loadPosts);
$("clearNotifications").addEventListener("click",markNotificationsSeen);
$("refreshBlockedUsers")?.addEventListener("click",loadBlockedUsers);
$("postComposer").value = localStorage.getItem(DRAFT_KEY) || "";
updateComposerMeta();
updateImagePreview();
$("postComposer").addEventListener("input", () => {
  updateComposerMeta();
  try { localStorage.setItem(DRAFT_KEY, $("postComposer").value); $("draftStatus").textContent = $("postComposer").value ? "Draft saved on this device." : "Drafts save on this device."; }
  catch (_) { $("draftStatus").textContent = "Draft saving isn't available in this browser."; }
});
$("postComposer").addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") publishPost(); });
$("clearDraft").addEventListener("click", () => {
  $("postComposer").value = ""; $("postImageUrl").value = ""; updateImagePreview(); localStorage.removeItem(DRAFT_KEY); updateComposerMeta();
  $("draftStatus").textContent = "Draft cleared."; $("postStatus").textContent = "Your draft was cleared. No post was published.";
  $("postComposer").focus();
});
$("postSearch").addEventListener("input", renderPosts);
$("postImageUrl").addEventListener("input", updateImagePreview);
$("profileBannerUrl").addEventListener("input", updateBannerPreview);
$("imagePreviewImg").addEventListener("load", () => { $("imagePreviewStatus").textContent = "Preview ready. It will be attached when you publish."; });
$("imagePreviewImg").addEventListener("error", () => { $("imagePreviewStatus").textContent = "Couldn’t load this preview. The URL may still work for other people."; });
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