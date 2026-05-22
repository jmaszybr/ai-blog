const CONFIG = {
  owner: "jmaszybr",
  repo: "ai-blog",
  branch: "main",
  pendingPath: "data/pending_posts.json",
  rejectedPath: "data/rejected_posts.json",
  indexPath: "posts_index.json",
  targetImageWidth: 1200,
  targetImageHeight: 630,
};

const state = {
  token: "",
  owner: CONFIG.owner,
  repo: CONFIG.repo,
  branch: CONFIG.branch,
  pending: [],
  selected: null,
  selectedDraftHtml: "",
  selectedPrompt: "",
  imageFile: null,
  imageExt: "",
  imageBase64: "",
};

const $ = (id) => document.getElementById(id);

function showStatus(message, type = "") {
  const box = $("status");
  box.textContent = message;
  box.className = `status ${type}`.trim();
  box.classList.remove("hidden");
}

function hideStatus() {
  $("status").classList.add("hidden");
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function fileToBase64(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function githubHeaders() {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${state.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function apiUrl(path) {
  return `https://api.github.com/repos/${state.owner}/${state.repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}`;
}

async function getContent(path, optional = false) {
  const url = `${apiUrl(path)}?ref=${encodeURIComponent(state.branch)}`;
  const response = await fetch(url, { headers: githubHeaders() });

  if (response.status === 404 && optional) return null;
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać ${path}. GitHub API: ${response.status}`);
  }

  return response.json();
}

async function getTextFile(path, fallback = null) {
  const data = await getContent(path, fallback !== null);
  if (!data) return fallback;
  return base64ToUtf8(data.content || "");
}

async function putFile(path, base64Content, message, existingSha = undefined) {
  const body = {
    message,
    content: base64Content,
    branch: state.branch,
  };
  if (existingSha) body.sha = existingSha;

  const response = await fetch(apiUrl(path), {
    method: "PUT",
    headers: {
      ...githubHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(`Nie udało się zapisać ${path}. GitHub API: ${response.status} ${details.message || ""}`);
  }

  return response.json();
}

async function putTextFile(path, text, message) {
  const existing = await getContent(path, true);
  return putFile(path, utf8ToBase64(text), message, existing?.sha);
}

async function putBinaryFile(path, base64, message) {
  const existing = await getContent(path, true);
  return putFile(path, base64, message, existing?.sha);
}

function readFormConfig() {
  state.owner = $("ownerInput").value.trim();
  state.repo = $("repoInput").value.trim();
  state.branch = $("branchInput").value.trim();
  state.token = $("tokenInput").value.trim();

  if (!state.owner || !state.repo || !state.branch || !state.token) {
    throw new Error("Uzupełnij owner, repo, branch i token.");
  }

  sessionStorage.setItem("aiBlogAdminOwner", state.owner);
  sessionStorage.setItem("aiBlogAdminRepo", state.repo);
  sessionStorage.setItem("aiBlogAdminBranch", state.branch);
  sessionStorage.setItem("aiBlogAdminToken", state.token);
}

function loadStoredConfig() {
  $("ownerInput").value = sessionStorage.getItem("aiBlogAdminOwner") || CONFIG.owner;
  $("repoInput").value = sessionStorage.getItem("aiBlogAdminRepo") || CONFIG.repo;
  $("branchInput").value = sessionStorage.getItem("aiBlogAdminBranch") || CONFIG.branch;
  $("tokenInput").value = sessionStorage.getItem("aiBlogAdminToken") || "";
}

async function loadPending() {
  hideStatus();
  readFormConfig();

  const raw = await getTextFile(CONFIG.pendingPath, "[]");
  let pending = [];
  try {
    pending = JSON.parse(raw || "[]");
  } catch {
    throw new Error(`${CONFIG.pendingPath} nie zawiera poprawnego JSON.`);
  }

  state.pending = Array.isArray(pending) ? pending : [];
  renderDraftList();
  showStatus(`Pobrano ${state.pending.length} szkiców.`, "success");
}

function renderDraftList() {
  const list = $("draftList");
  $("draftCount").textContent = String(state.pending.length);

  if (!state.pending.length) {
    list.className = "draft-list empty";
    list.textContent = "Brak szkiców do publikacji.";
    return;
  }

  list.className = "draft-list";
  list.innerHTML = "";

  state.pending.forEach((post, index) => {
    const btn = document.createElement("button");
    btn.className = "draft-item";
    if (state.selected?.slug === post.slug) btn.classList.add("active");
    btn.innerHTML = `<strong>${escapeHtml(post.title || post.slug)}</strong><span>${escapeHtml(post.status || "pending_image")} · ${escapeHtml(post.date || "")}</span>`;
    btn.addEventListener("click", () => selectDraft(index));
    list.appendChild(btn);
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

async function selectDraft(index) {
  hideStatus();
  const post = state.pending[index];
  state.selected = post;
  state.imageFile = null;
  state.imageExt = "";
  state.imageBase64 = "";

  const draftPath = post.draftPath || `posts/drafts/${post.slug}.html`;
  const promptPath = post.promptPath || `prompts/${post.slug}.txt`;

  const [draftHtml, prompt] = await Promise.all([
    getTextFile(draftPath, ""),
    getTextFile(promptPath, ""),
  ]);

  state.selectedDraftHtml = draftHtml;
  state.selectedPrompt = prompt;

  $("emptyState").classList.add("hidden");
  $("draftView").classList.remove("hidden");

  $("selectedStatus").textContent = post.status || "Szkic";
  $("selectedTitle").textContent = post.title || post.slug;
  $("selectedSlug").textContent = post.slug;
  $("selectedTopic").textContent = post.topic || "—";
  $("selectedDate").textContent = post.date || "—";
  $("excerptInput").value = post.excerpt || "";
  $("promptBox").value = prompt || "Brak promptu.";
  $("draftFrame").srcdoc = draftHtml || "<p>Brak treści szkicu.</p>";
  $("imagePreview").classList.add("hidden");
  $("imagePreview").innerHTML = "";
  $("publishBtn").disabled = true;
  $("publishHint").textContent = "Dodaj obraz, aby opublikować.";

  renderDraftList();
}

function getImageExtension(file) {
  const byType = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  return byType[file.type] || file.name.split(".").pop().toLowerCase();
}

async function validateAndStoreImage(file) {
  const ext = getImageExtension(file);
  if (!["png", "jpg", "jpeg", "webp"].includes(ext)) {
    throw new Error("Dozwolone formaty obrazu: PNG, JPG, JPEG, WebP.");
  }

  const url = URL.createObjectURL(file);
  const img = new Image();

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("Nie udało się odczytać obrazu."));
    img.src = url;
  });

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  URL.revokeObjectURL(url);

  if (width !== CONFIG.targetImageWidth || height !== CONFIG.targetImageHeight) {
    throw new Error(`Obraz ma ${width} × ${height} px. Wymagany rozmiar: ${CONFIG.targetImageWidth} × ${CONFIG.targetImageHeight} px.`);
  }

  state.imageFile = file;
  state.imageExt = ext === "jpeg" ? "jpg" : ext;
  state.imageBase64 = await fileToBase64(file);

  const previewUrl = URL.createObjectURL(file);
  $("imagePreview").innerHTML = `<img src="${previewUrl}" alt="Podgląd obrazu"><p>${file.name} · ${width} × ${height} px</p>`;
  $("imagePreview").classList.remove("hidden");
  $("publishBtn").disabled = false;
  $("publishHint").textContent = "Obraz jest gotowy. Możesz opublikować wpis.";
}

function replaceImagePlaceholder(html, imageSrc, title) {
  const img = `<img src="${escapeHtml(imageSrc)}" class="post-hero" alt="${escapeHtml(title)}">`;

  if (html.includes("<!--BLOG_IMAGE_PLACEHOLDER_START-->") && html.includes("<!--BLOG_IMAGE_PLACEHOLDER_END-->")) {
    return html.replace(
      /<!--BLOG_IMAGE_PLACEHOLDER_START-->[\s\S]*?<!--BLOG_IMAGE_PLACEHOLDER_END-->/,
      img
    );
  }

  if (html.includes('class="post-image-placeholder"')) {
    return html.replace(
      /<div class="post-image-placeholder"[\s\S]*?<\/div>/,
      img
    );
  }

  return html.replace("</header>", `${img}\n      </header>`);
}

async function publishSelected() {
  if (!state.selected) return;
  if (!state.imageFile || !state.imageBase64) {
    showStatus("Najpierw dodaj obraz.", "error");
    return;
  }

  $("publishBtn").disabled = true;
  showStatus("Publikuję wpis przez GitHub API...");

  const post = {
    ...state.selected,
    excerpt: $("excerptInput").value.trim() || state.selected.excerpt || "",
  };

  const imagePathForArticle = `images/${post.slug}.${state.imageExt}`;
  const imagePathForIndex = `posts/images/${post.slug}.${state.imageExt}`;
  const repoImagePath = `posts/images/${post.slug}.${state.imageExt}`;
  const finalPostPath = `posts/${post.slug}.html`;

  const finalHtml = replaceImagePlaceholder(
    state.selectedDraftHtml,
    imagePathForArticle,
    post.title || post.slug
  );

  await putBinaryFile(repoImagePath, state.imageBase64, `Add image for ${post.slug}`);
  await putTextFile(finalPostPath, finalHtml, `Publish post ${post.slug}`);

  const indexRaw = await getTextFile(CONFIG.indexPath, "[]");
  let index = [];
  try { index = JSON.parse(indexRaw || "[]"); } catch { index = []; }
  if (!Array.isArray(index)) index = [];

  const entry = {
    id: post.id || crypto.randomUUID().slice(0, 8),
    title: post.title,
    topic: post.topic,
    excerpt: post.excerpt,
    date: post.date,
    url: finalPostPath,
    imageUrl: imagePathForIndex,
  };

  index = index.filter((item) => item.url !== finalPostPath && item.id !== entry.id);
  index.unshift(entry);
  index = index.slice(0, 100);

  const newPending = state.pending.filter((item) => item.slug !== post.slug);

  await putTextFile(CONFIG.indexPath, JSON.stringify(index, null, 2), `Update index for ${post.slug}`);
  await putTextFile(CONFIG.pendingPath, JSON.stringify(newPending, null, 2), `Remove published draft ${post.slug}`);

  state.pending = newPending;
  state.selected = null;
  $("draftView").classList.add("hidden");
  $("emptyState").classList.remove("hidden");
  renderDraftList();
  showStatus(`Opublikowano: ${post.title}`, "success");
}

async function rejectSelected() {
  if (!state.selected) return;
  const ok = confirm(`Odrzucić szkic „${state.selected.title || state.selected.slug}”?`);
  if (!ok) return;

  showStatus("Odrzucam szkic...");
  const rejectedRaw = await getTextFile(CONFIG.rejectedPath, "[]");
  let rejected = [];
  try { rejected = JSON.parse(rejectedRaw || "[]"); } catch { rejected = []; }
  if (!Array.isArray(rejected)) rejected = [];

  rejected.unshift({
    ...state.selected,
    status: "rejected",
    rejectedAt: new Date().toISOString(),
  });

  const newPending = state.pending.filter((item) => item.slug !== state.selected.slug);

  await putTextFile(CONFIG.rejectedPath, JSON.stringify(rejected, null, 2), `Reject draft ${state.selected.slug}`);
  await putTextFile(CONFIG.pendingPath, JSON.stringify(newPending, null, 2), `Remove rejected draft ${state.selected.slug}`);

  state.pending = newPending;
  state.selected = null;
  $("draftView").classList.add("hidden");
  $("emptyState").classList.remove("hidden");
  renderDraftList();
  showStatus("Szkic odrzucony.", "success");
}

function bindEvents() {
  $("connectBtn").addEventListener("click", () => loadPending().catch((err) => showStatus(err.message, "error")));
  $("reloadBtn").addEventListener("click", () => loadPending().catch((err) => showStatus(err.message, "error")));
  $("forgetBtn").addEventListener("click", () => {
    sessionStorage.removeItem("aiBlogAdminToken");
    $("tokenInput").value = "";
    showStatus("Token usunięty z tej sesji.", "success");
  });

  $("copyPromptBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("promptBox").value);
    showStatus("Prompt skopiowany.", "success");
  });

  $("imageInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await validateAndStoreImage(file);
      showStatus("Obraz zaakceptowany.", "success");
    } catch (err) {
      state.imageFile = null;
      state.imageBase64 = "";
      $("publishBtn").disabled = true;
      showStatus(err.message, "error");
    }
  });

  $("publishBtn").addEventListener("click", () => publishSelected().catch((err) => {
    $("publishBtn").disabled = false;
    showStatus(err.message, "error");
  }));

  $("rejectBtn").addEventListener("click", () => rejectSelected().catch((err) => showStatus(err.message, "error")));
}

loadStoredConfig();
bindEvents();
