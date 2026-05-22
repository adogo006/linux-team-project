// ── editor.js ──
const TOKEN_REFRESH_INTERVAL_MS = 50 * 60 * 1000;

// ── 상태 ──────────────────────────────────────────────────────
let currentUser = { nickname: "", role: "member" };
let projectInfo = { id: "", name: "" };
let members = [];
let fileTree = [];
let fileCodes = {}; // { file_id: "코드 내용" }
let fileNodeMap = {}; // { file_id: node 객체 }
let editLogs = []; // 서버에서 받아온 프로젝트 로그
let activeFile = null; // 현재 열린 파일 노드
let isEditingNow = false;
let codeSnapshot = "";

let heartbeatTimer = null; // 파일 편집 하트비트 인터벌
let pollTimer = null; // 멤버 폴링 인터벌
let tokenRefreshTimer = null;

async function request_refresh(token) {
  const res = await fetch(`/api/request_refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "REFRESH_FAILED");
  return data;
}

async function request_logout(token) {
  const res = await fetch(`/api/request_logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "LOGOUT_FAILED");
  return data;
}

function startTokenRefreshTimer() {
  stopTokenRefreshTimer();
  tokenRefreshTimer = setInterval(async () => {
    const token = sessionStorage.getItem("access_token");
    if (!token) return;

    try {
      const data = await request_refresh(token);
      sessionStorage.setItem("access_token", data.access_token);
      sessionStorage.setItem("token_type", data.token_type);
    } catch (e) {
      console.error("토큰 갱신 실패:", e);
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("token_type");
      sessionStorage.removeItem("nickname");
      window.location.href = "login.html";
    }
  }, TOKEN_REFRESH_INTERVAL_MS);
}

function stopTokenRefreshTimer() {
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
}

async function handleLogout() {
  const token = sessionStorage.getItem("access_token");

  try {
    if (token) {
      await request_logout(token);
    }
  } catch (e) {
    console.error("로그아웃 요청 실패:", e);
  } finally {
    stopTokenRefreshTimer();
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("token_type");
    sessionStorage.removeItem("nickname");
    window.location.href = "login.html";
  }
}

// ── 초기화 ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const token = sessionStorage.getItem("access_token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // URL에서 project_id 추출
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");
  if (!projectId) {
    window.location.href = "project.html";
    return;
  }

  projectInfo.id = projectId;

  const nickname = sessionStorage.getItem("nickname") || "";
  currentUser.nickname = nickname;

  startTokenRefreshTimer();

  try {
    await loadProject(token, projectId);
  } catch (e) {
    console.error("프로젝트 로드 실패:", e);
    // window.location.href = "project.html"; // 개발 중에는 즉시 리디렉트하지 않고 오류 내용을 알려줍니다.
    try {
      // 개발용: 즉시 리디렉트하면 원인 파악이 어렵기 때문에 오류 내용을 알려주고 리디렉트 동작을 멈춥니다.
      alert("프로젝트 로드 실패: " + (e && e.message ? e.message : String(e)) + "\n콘솔에서 스택을 확인하세요.");
    } catch (err) {
      // ignore alert failures
    }
    // 개발 중에는 리디렉트하지 않고 콘솔에 스택을 남긴 뒤 중단합니다.
    return;
  }

  // 삭제 확인 인풋 감지
  const input = document.getElementById("delete-input");
  if (input) {
    input.addEventListener("input", () => {
      const btn = document.getElementById("btn-delete-confirm");
      input.value === "삭제"
        ? btn.classList.add("ready")
        : btn.classList.remove("ready");
    });
  }

  // 멤버 목록 5초 폴링 시작
  pollTimer = setInterval(() => pollMembers(token, projectId), 5000);

  // 페이지 떠날 때 편집 상태 해제
  window.addEventListener("beforeunload", () => {
    if (isEditingNow && activeFile) {
      releaseFile(token, projectId, activeFile.file_id);
    }
  });
});

window.addEventListener("beforeunload", stopTokenRefreshTimer);

// ── 프로젝트 열기 ─────────────────────────────────────────────
async function loadProject(token, projectId) {
  console.debug("loadProject: projectId=", projectId, "tokenExists=", !!token);
  const res = await fetch(`/api/request_project_open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ project_id: projectId }),
  });
  const data = await res.json();
  if (!data.success) {
    console.error("request_project_open failed:", res.status, data);
    try {
      // 개발용: 실패 응답 내용을 바로 보여줘서 원인 파악을 쉽게 합니다.
      alert("request_project_open failed:\nstatus: " + res.status + "\nresponse: " + JSON.stringify(data));
    } catch (err) {
      /* ignore */
    }
    throw new Error("OPEN_FAILED");
  }

  projectInfo.name = data.project.project_name;
  editLogs = data.logs || [];

  // 파일 트리 변환 및 nodeMap 구성
  fileTree = buildTreeFromServer(data.file_tree);

  // 멤버 목록 로드
  await loadMembers(token, projectId);

  renderNav();
  renderUsers();
  renderFileTree();
  showEmpty();
}

// ── 서버 파일트리 → 내부 트리 구조 변환 ──────────────────────
// 서버: [{ id, name, type, parent_id, children }, ...]
// nodes 에 지금 file_tree 전체가 들어가 있다.
function buildTreeFromServer(nodes) {
  if (!nodes || !Array.isArray(nodes)) return [];
  return nodes.map((n) => {
    const node = {
      file_id: n.id,
      name: n.name,
      type: n.type === "DIRECTORY" ? "folder" : "file",
      path: n.path,
      editingBy: null,
      open: true,
    };
    if (node.type === "folder") {
      node.children = buildTreeFromServer(n.children || []);
    }
    fileNodeMap[n.id] = node;
    return node;
  });
}

// ── 멤버 목록 로드 ────────────────────────────────────────────
async function loadMembers(token, projectId) {
  const res = await fetch(`/api/request_project_members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ project_id: projectId }),
  });
  const data = await res.json();
  if (!data.success) return;

  members = data.members.map((m) => ({
    nickname: m.nickname,
    role: m.is_creator ? "owner" : "member",
    isEditing: m.is_editing,
  }));

  // 내 role 업데이트
  const me = members.find((m) => m.nickname === currentUser.nickname);
  if (me) currentUser.role = me.role;

  renderUsers();
}

// ── 멤버 폴링 ─────────────────────────────────────────────────
async function pollMembers(token, projectId) {
  try {
    await loadMembers(token, projectId);
  } catch (e) {
    console.error("멤버 폴링 실패:", e);
  }
}

// ── 네비게이션 ───────────────────────────────────────────────
function renderNav() {
  const projectNameButton = document.getElementById("nav-project-name");
  projectNameButton.textContent = projectInfo.name;
  projectNameButton.title = "프로젝트 이름 변경";
  projectNameButton.onclick = handleProjectRename;

  const badge = document.getElementById("nav-role-badge");
  if (currentUser.role === "owner") {
    badge.textContent = "프로젝트장";
    badge.className = "nav-role-badge owner";
  } else {
    badge.textContent = "";
    badge.className = "nav-role-badge";
  }
}

// ── 사용자 목록 ──────────────────────────────────────────────
function renderUsers() {
  const list = document.getElementById("user-list");
  const owner = members.find((m) => m.role === "owner");
  const rest = members
    .filter((m) => m.role !== "owner")
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));

  let html = "";

  if (owner) {
    const isMe = owner.nickname === currentUser.nickname;
    html += `
      <div class="role-group">
        <div class="role-label">프로젝트장</div>
        <div class="user-item">
          <div class="user-avatar owner">${getInitials(owner.nickname)}</div>
          <div class="user-info">
            <div class="user-name">
              ${escHtml(owner.nickname)}
              ${isMe ? '<span style="color:var(--text-dim);font-size:10px"> (나)</span>' : ""}
              <span class="owner-crown" title="프로젝트장">👑</span>
            </div>
            ${owner.isEditing ? '<div class="user-status editing">수정 중</div>' : ""}
          </div>
        </div>
      </div>`;
  }

  if (rest.length > 0) {
    html += `<div class="role-group"><div class="role-label">멤버</div>`;
    for (const m of rest) {
      const isMe = m.nickname === currentUser.nickname;
      const canKick = currentUser.role === "owner" && !isMe;
      html += `
        <div class="user-item" id="user-${escHtml(m.nickname)}">
          <div class="user-avatar member">${getInitials(m.nickname)}</div>
          <div class="user-info">
            <div class="user-name">
              ${escHtml(m.nickname)}
              ${isMe ? '<span style="color:var(--text-dim);font-size:10px"> (나)</span>' : ""}
            </div>
            ${m.isEditing ? '<div class="user-status editing">수정 중</div>' : ""}
          </div>
          ${canKick ? `<button class="user-menu-btn" onclick="openUserMenu(event,'${escHtml(m.nickname)}')">⋯</button>` : ""}
        </div>`;
    }
    html += "</div>";
  }

  list.innerHTML = html;

  const bottom = document.getElementById("panel-bottom");
  bottom.style.display = currentUser.role === "owner" ? "flex" : "none";
}

// ── 파일 트리 ────────────────────────────────────────────────
function renderFileTree() {
  document.getElementById("file-tree").innerHTML = buildTreeHTML(
    fileTree,
    0,
    "",
  );
}

function buildTreeHTML(nodes, depth, parentPath) {
  let html = "";
  const indent = depth > 0 ? `indent-${Math.min(depth, 3)}` : "";

  for (const node of nodes) {
    const nodePath = parentPath
      ? `${parentPath}::${node.file_id}`
      : node.file_id;

    if (node.type === "folder") {
      const arrow = node.open ? "▾" : "▸";
      html += `
        <div class="tree-item folder ${indent}" onclick="toggleFolder('${nodePath}')" oncontextmenu="openNodeCtx(event, '${node.file_id}', 'folder')">
          <span class="tree-icon">${arrow}</span>
          <span class="tree-name">${escHtml(node.name)}</span>
          <span class="tree-add-btn"
                onclick="event.stopPropagation(); openTreeCtx(event,'${node.file_id}')"
                title="이 폴더에 추가">+</span>
        </div>`;
      if (node.open && node.children) {
        html += buildTreeHTML(node.children, depth + 1, nodePath);
      }
    } else {
      const icon = fileIcon(node.name.split(".").pop());
      const editTag = node.editingBy
        ? `<span class="editing-tag">@${escHtml(node.editingBy)}</span>`
        : "";
      html += `
        <div class="tree-item file ${indent} ${activeFile?.file_id === node.file_id ? "active" : ""}"
             onclick="openFile('${node.file_id}')" oncontextmenu="openNodeCtx(event, '${node.file_id}', 'file')">
          <span class="tree-icon">${icon}</span>
          <span class="tree-name">${escHtml(node.name)}</span>
          ${editTag}
        </div>`;
    }
  }
  return html;
}

function toggleFolder(path) {
  const id = path.split("::").pop();
  const node = fileNodeMap[id];
  if (node) {
    node.open = !node.open;
    renderFileTree();
  }
}

function fileIcon(ext) {
  const map = {
    java: "☕",
    js: "🟨",
    ts: "🔷",
    html: "🌐",
    css: "🎨",
    json: "{}",
    yml: "⚙",
    yaml: "⚙",
    md: "📝",
    gradle: "🐘",
    py: "🐍",
    go: "🐹",
    rs: "🦀",
    xml: "📄",
  };
  return map[ext] || "📄";
}

// ── 파일 열기 ────────────────────────────────────────────────
async function openFile(fileId) {
  const token = sessionStorage.getItem("access_token");
  const node = fileNodeMap[fileId];
  if (!node || node.type !== "file") return;

  // 다른 파일 수정 중이면 먼저 완료
  if (isEditingNow && activeFile) await finishEdit(false);

  try {
    const res = await fetch(`/api/request_file_open`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ project_id: projectInfo.id, file_uid: fileId }),
    });
    const data = await res.json();

    if (!data.success) {
      // 409: 다른 사용자 수정 중
      if (res.status === 409 || (data.file && data.editing_users?.length > 0)) {
        const who = data.detail?.editing_users || data.editing_users || [];
        node.editingBy = who[0] || "다른 사용자";
      } else {
        alert(data.message || "파일을 열 수 없습니다.");
      }
      renderFileTree();
      return;
    }

    fileCodes[fileId] = data.file.content || "";
    node.editingBy =
      data.editing_users?.length > 0 ? data.editing_users[0] : null;

    activeFile = node;
    renderFileTree();
    renderTabs();
    renderToolbar();
    renderCode();
  } catch (e) {
    console.error("파일 열기 실패:", e);
  }
}

// ── 탭 / 툴바 / 코드 렌더 ────────────────────────────────────
function renderTabs() {
  const tabs = document.getElementById("editor-tabs");
  if (!activeFile) {
    tabs.innerHTML = "";
    return;
  }

  const ext = activeFile.name.split(".").pop();
  const colorMap = {
    java: "#f97316",
    js: "#facc15",
    ts: "#3b82f6",
    html: "#22c55e",
    css: "#a78bfa",
    md: "#6b7280",
    yml: "#6b7280",
    gradle: "#22c55e",
  };
  tabs.innerHTML = `
    <div class="editor-tab active">
      <span class="tab-dot" style="background:${colorMap[ext] || "#6b7280"}"></span>
      ${escHtml(activeFile.name)}
    </div>`;
}

function renderToolbar() {
  const toolbar = document.getElementById("editor-toolbar");
  if (!activeFile) {
    toolbar.innerHTML = "";
    return;
  }

  const isEditingByOther =
    activeFile.editingBy && activeFile.editingBy !== currentUser.nickname;
  const isMeEditing = activeFile.editingBy === currentUser.nickname;
  const logCount = editLogs.filter(
    (l) => l.target_node_name === activeFile.name,
  ).length;

  const logBtn = `
    <button class="btn-log" onclick="openLogPanel()" title="수정 로그">
      📋 수정 로그${logCount > 0 ? ` <span class="log-count">${logCount}</span>` : ""}
    </button>`;

  let editBtn = "";
  if (isEditingByOther) {
    editBtn = `<button class="btn-edit" disabled style="opacity:.5;cursor:not-allowed;background:var(--orange)">
                 @${escHtml(activeFile.editingBy)} 수정 중
               </button>`;
  } else if (isMeEditing) {
    editBtn = `<button class="btn-edit editing" onclick="toggleEdit()">수정 완료</button>`;
  } else {
    editBtn = `<button class="btn-edit" onclick="toggleEdit()">수정</button>`;
  }

  toolbar.innerHTML = `
    <span class="toolbar-path"><span>${escHtml(activeFile.name)}</span></span>
    ${logBtn}
    ${editBtn}`;
}

function renderCode() {
  const area = document.getElementById("code-area");
  if (!activeFile) {
    area.innerHTML = emptyState();
    return;
  }

  const code = fileCodes[activeFile.file_id] || "";
  const lines = code.split("\n");
  const lineNums = lines.map((_, i) => i + 1).join("\n");
  const isMeEditing = activeFile.editingBy === currentUser.nickname;
  const isEditingByOther = activeFile.editingBy && !isMeEditing;

  area.innerHTML = `
    <div class="line-numbers" id="line-numbers">${lineNums}</div>
    <textarea class="code-editor" id="code-editor"
      ${!isMeEditing || isEditingByOther ? "disabled" : ""}
      spellcheck="false"
      oninput="syncLineNumbers()"
    >${escHtml(code)}</textarea>`;

  const editor = document.getElementById("code-editor");
  const nums = document.getElementById("line-numbers");
  editor.addEventListener("scroll", () => {
    nums.scrollTop = editor.scrollTop;
  });
}

function emptyState() {
  return `<div class="code-empty">
    <span class="icon">{'_'}</span>
    <span>파일을 선택하면 코드가 표시됩니다</span>
  </div>`;
}

function showEmpty() {
  document.getElementById("code-area").innerHTML = emptyState();
  document.getElementById("editor-tabs").innerHTML = "";
  document.getElementById("editor-toolbar").innerHTML = "";
}

function syncLineNumbers() {
  const editor = document.getElementById("code-editor");
  if (!editor || !activeFile) return;
  const nums = document.getElementById("line-numbers");
  if (nums)
    nums.textContent = editor.value
      .split("\n")
      .map((_, i) => i + 1)
      .join("\n");
  fileCodes[activeFile.file_id] = editor.value;
}

// ── 수정 토글 ────────────────────────────────────────────────
async function toggleEdit() {
  if (!activeFile) return;
  if (isEditingNow) {
    await finishEdit(true);
  } else {
    await startEdit();
  }
}

async function startEdit() {
  const token = sessionStorage.getItem("access_token");
  codeSnapshot = fileCodes[activeFile.file_id] || "";
  activeFile.editingBy = currentUser.nickname;
  isEditingNow = true;

  renderFileTree();
  renderToolbar();
  renderCode();
  document.getElementById("code-editor")?.focus();

  // 하트비트 10초 주기 시작
  heartbeatTimer = setInterval(() => sendHeartbeat(token), 10000);
}

async function finishEdit(save) {
  const token = sessionStorage.getItem("access_token");
  if (!activeFile) return;

  const newCode = fileCodes[activeFile.file_id] || "";

  // 하트비트 중단
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (save && newCode !== codeSnapshot) {
    await saveFile(token, projectInfo.id, activeFile.file_id, newCode);
    // 저장 후 서버 로그 갱신
    await refreshLogs(token, projectInfo.id);
  }

  // 편집 상태 서버에 해제
  await releaseFile(token, projectInfo.id, activeFile.file_id);

  activeFile.editingBy = null;
  isEditingNow = false;
  codeSnapshot = "";

  renderFileTree();
  renderToolbar();
  renderCode();
}

// ── 파일 저장 API ─────────────────────────────────────────────
async function saveFile(token, projectId, fileId, content) {
  try {
    const res = await fetch(`/api/request_file_save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        file_uid: fileId,
        content,
      }),
    });
    const data = await res.json();
    if (!data.success) console.error("파일 저장 실패:", data.message);
  } catch (e) {
    console.error("파일 저장 오류:", e);
  }
}

// ── 하트비트 API ──────────────────────────────────────────────
async function sendHeartbeat(token) {
  if (!activeFile || !isEditingNow) return;
  try {
    await fetch(`/api/request_file_heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        project_id: projectInfo.id,
        file_uid: activeFile.file_id,
      }),
    });
  } catch (e) {
    console.error("하트비트 실패:", e);
  }
}

// ── 편집 해제 API ─────────────────────────────────────────────
async function releaseFile(token, projectId, fileId) {
  try {
    await fetch(`/api/request_file_release`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ project_id: projectId, file_uid: fileId }),
    });
  } catch (e) {
    console.error("편집 해제 실패:", e);
  }
}

// ── 로그 갱신 ────────────────────────────────────────────────
async function refreshLogs(token, projectId) {
  try {
    const res = await fetch(`/api/request_project_open`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ project_id: projectId }),
    });
    const data = await res.json();
    if (data.success) editLogs = data.logs || [];
    renderToolbar(); // 로그 카운트 갱신
  } catch (e) {
    console.error("로그 갱신 실패:", e);
  }
}

// ── 수정 로그 패널 ────────────────────────────────────────────
function openLogPanel() {
  if (!activeFile) return;
  const logs = editLogs.filter((l) => l.target_node_name === activeFile.name);
  const overlay = document.getElementById("log-overlay");
  const content = document.getElementById("log-content");
  document.getElementById("log-title").textContent =
    `수정 로그 — ${activeFile.name}`;

  if (logs.length === 0) {
    content.innerHTML = `<div class="log-empty">아직 수정 기록이 없습니다.</div>`;
  } else {
    content.innerHTML = [...logs]
      .reverse()
      .map(
        (log, i) => `
      <div class="log-entry" id="log-entry-${i}">
        <div class="log-entry-header" onclick="toggleLogEntry(${i})">
          <div class="log-entry-who">
            <span class="log-avatar">${getInitials(log.user_nickname)}</span>
            <span class="log-nickname">${escHtml(log.user_nickname)}</span>
          </div>
          <div class="log-entry-meta">
            <span class="log-time">${formatTime(log.timestamp)}</span>
            <span class="log-arrow" id="log-arrow-${i}">▾</span>
          </div>
        </div>
        <div class="log-diff" id="log-diff-${i}">
          <div class="diff-block">${escHtml(log.message)}</div>
        </div>
      </div>`,
      )
      .join("");
  }

  overlay.classList.add("open");
}

function toggleLogEntry(i) {
  const diff = document.getElementById(`log-diff-${i}`);
  const arrow = document.getElementById(`log-arrow-${i}`);
  const open = diff.style.display !== "none" && diff.style.display !== "";
  if (open || diff.style.display === "") {
    diff.style.display = "none";
    arrow.textContent = "▸";
  } else {
    diff.style.display = "block";
    arrow.textContent = "▾";
  }
}

function closeLogPanel() {
  document.getElementById("log-overlay").classList.remove("open");
}

function handleLogOverlay(e) {
  if (e.target === document.getElementById("log-overlay")) closeLogPanel();
}

// ── 파일 / 폴더 추가 ─────────────────────────────────────────
async function addFile(parentId) {
  const token = sessionStorage.getItem("access_token");
  const name = prompt("파일 이름을 입력하세요 (예: MyClass.java)");
  if (!name?.trim()) return;

  try {
    const res = await fetch(`/api/request_file_create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        project_id: projectInfo.id,
        file_name: name.trim(),
        parent_node_id: parentId || null,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "파일 생성 실패");
      return;
    }

    const node = {
      file_id: data.file.file_id,
      name: data.file.file_name,
      type: "file",
      editingBy: null,
    };
    fileNodeMap[node.file_id] = node;

    if (parentId && fileNodeMap[parentId]) {
      fileNodeMap[parentId].children.push(node);
      fileNodeMap[parentId].open = true;
    } else {
      fileTree.push(node);
    }
    renderFileTree();
  } catch (e) {
    console.error("파일 생성 오류:", e);
  }
}

async function addFolder(parentId) {
  const token = sessionStorage.getItem("access_token");
  const name = prompt("폴더 이름을 입력하세요");
  if (!name?.trim()) return;

  try {
    const res = await fetch(`/api/request_directory_create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        project_id: projectInfo.id,
        directory_name: name.trim(),
        parent_node_id: parentId || null,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "폴더 생성 실패");
      return;
    }

    const node = {
      file_id: data.directory.directory_id,
      name: data.directory.directory_name,
      type: "folder",
      open: true,
      children: [],
    };
    fileNodeMap[node.file_id] = node;

    if (parentId && fileNodeMap[parentId]) {
      fileNodeMap[parentId].children.push(node);
      fileNodeMap[parentId].open = true;
    } else {
      fileTree.push(node);
    }
    renderFileTree();
  } catch (e) {
    console.error("폴더 생성 오류:", e);
  }
}

// ── 컨텍스트 메뉴 ────────────────────────────────────────────
function openTreeCtx(e, folderId) {
  e.stopPropagation();
  closeCtxMenu();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.id = "ctx-menu";
  menu.innerHTML = `
    <div class="ctx-item" onclick="addFile('${folderId}'); closeCtxMenu()">📄 파일 추가</div>
    <div class="ctx-item" onclick="addFolder('${folderId}'); closeCtxMenu()">📁 폴더 추가</div>`;
  const { x, y } = calcMenuPos(e, 170, 80);
  menu.style.top = y + "px";
  menu.style.left = x + "px";
  document.body.appendChild(menu);
  setTimeout(
    () => document.addEventListener("click", closeCtxMenu, { once: true }),
    0,
  );
}

function openNodeCtx(e, nodeId, nodeType) {
  e.preventDefault();
  e.stopPropagation();
  closeCtxMenu();

  const node = fileNodeMap[nodeId];
  if (!node) return;

  const deleteHandler =
    nodeType === "file"
      ? `deleteNode('${nodeId}', 'file')`
      : `deleteNode('${nodeId}', 'folder')`;
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.id = "ctx-menu";
  menu.innerHTML = `
    <div class="ctx-item" onclick="renameNode('${nodeId}', '${nodeType}'); closeCtxMenu()">✏ 이름 변경</div>
    <div class="ctx-item danger" onclick="${deleteHandler}; closeCtxMenu()">🗑 삭제</div>`;

  const { x, y } = calcMenuPos(e, 180, 80);
  menu.style.top = y + "px";
  menu.style.left = x + "px";
  document.body.appendChild(menu);
  setTimeout(
    () => document.addEventListener("click", closeCtxMenu, { once: true }),
    0,
  );
}

async function handleProjectRename() {
  const token = sessionStorage.getItem("access_token");
  const currentName = projectInfo.name || "";
  const newName = prompt("프로젝트 이름을 입력하세요", currentName)?.trim();
  if (!newName || newName === currentName) return;

  try {
    const res = await fetch(`/api/request_project_rename`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ project_id: projectInfo.id, new_name: newName }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "프로젝트 이름 변경 실패");
      return;
    }

    projectInfo.name = newName;
    renderNav();
  } catch (e) {
    alert("서버와 연결할 수 없습니다.");
  }
}

async function renameNode(nodeId, nodeType) {
  const token = sessionStorage.getItem("access_token");
  const node = fileNodeMap[nodeId];
  if (!node) return;

  const newName = prompt("이름을 입력하세요", node.name)?.trim();
  if (!newName || newName === node.name) return;

  try {
    const res = await fetch(`/api/request_node_rename`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        project_id: projectInfo.id,
        node_id: nodeId,
        new_name: newName,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "이름 변경 실패");
      return;
    }

    node.name = newName;
    if (activeFile?.file_id === nodeId) {
      activeFile.name = newName;
      renderTabs();
      renderToolbar();
    }
    renderFileTree();
  } catch (e) {
    alert("서버와 연결할 수 없습니다.");
  }
}

async function deleteNode(nodeId, nodeType) {
  const token = sessionStorage.getItem("access_token");
  const node = fileNodeMap[nodeId];
  if (!node) return;

  const confirmText = nodeType === "folder"
    ? `폴더 "${node.name}"와 하위 항목을 삭제하려면 확인을 누르세요.`
    : `파일 "${node.name}"을 삭제하려면 확인을 누르세요.`;
  if (!confirm(confirmText)) return;

  const endpoint = nodeType === "folder"
    ? "/api/request_directory_delete"
    : "/api/request_file_delete";
  const payload = nodeType === "folder"
    ? { project_id: projectInfo.id, node_uid: nodeId }
    : { project_id: projectInfo.id, file_uid: nodeId };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "삭제 실패");
      return;
    }

    const removedIds = removeNodeFromTree(nodeId);
    if (activeFile && removedIds.has(activeFile.file_id)) {
      activeFile = null;
      showEmpty();
    }
    renderFileTree();
  } catch (e) {
    alert("서버와 연결할 수 없습니다.");
  }
}

function removeNodeFromTree(nodeId) {
  const removedIds = new Set();

  function pruneNode(node) {
    removedIds.add(node.file_id);
    delete fileNodeMap[node.file_id];

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        pruneNode(child);
      }
    }
  }

  function walk(nodes) {
    const next = [];
    for (const node of nodes) {
      if (node.file_id === nodeId) continue;
      if (node.children) {
        node.children = walk(node.children);
      }
      next.push(node);
    }
    return next;
  }

  const removedNode = fileNodeMap[nodeId];
  if (removedNode) {
    pruneNode(removedNode);
  }
  fileTree = walk(fileTree);
  return removedIds;
}

function openUserMenu(e, nickname) {
  e.stopPropagation();
  closeCtxMenu();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.id = "ctx-menu";
  menu.innerHTML = ctxItem(
    "프로젝트에서 추방",
    () => kickMember(nickname),
    true,
  );
  const { x, y } = calcMenuPos(e, 170, 60);
  menu.style.top = y + "px";
  menu.style.left = x + "px";
  document.body.appendChild(menu);
  setTimeout(
    () => document.addEventListener("click", closeCtxMenu, { once: true }),
    0,
  );
}

function ctxItem(label, action, danger = false) {
  const id = "ctx_" + Math.random().toString(36).slice(2);
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el)
      el.addEventListener("click", () => {
        action();
        closeCtxMenu();
      });
  }, 0);
  return `<div class="ctx-item${danger ? " danger" : ""}" id="${id}">${label}</div>`;
}

function closeCtxMenu() {
  document.getElementById("ctx-menu")?.remove();
}

function calcMenuPos(e, menuWidth = 170, menuHeight = 80) {
  const x =
    e.clientX + menuWidth > window.innerWidth
      ? e.clientX - menuWidth
      : e.clientX;
  const y =
    e.clientY + menuHeight > window.innerHeight
      ? e.clientY - menuHeight
      : e.clientY;
  return { x, y };
}

// ── 멤버 추방 ─────────────────────────────────────────────────
async function kickMember(nickname) {
  const token = sessionStorage.getItem("access_token");
  if (!confirm(`"${nickname}" 님을 프로젝트에서 추방하시겠습니까?`)) return;

  try {
    const res = await fetch(
      `/api/request_project_remove_member`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          project_id: projectInfo.id,
          target_nickname: nickname,
        }),
      },
    );
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "추방 실패");
      return;
    }

    members = members.filter((m) => m.nickname !== nickname);
    renderUsers();
  } catch (e) {
    console.error("추방 실패:", e);
  }
}

// ── 초대 모달 ────────────────────────────────────────────────
function openInviteModal() {
  document.getElementById("invite-overlay").classList.add("open");
  document.getElementById("invite-nickname-input").value = "";
  const hint = document.getElementById("invite-hint");
  hint.textContent = "";
  hint.className = "invite-hint info";
  document.getElementById("btn-invite-send").disabled = true;
  document.getElementById("invite-nickname-input").focus();
}

function closeInviteModal() {
  document.getElementById("invite-overlay").classList.remove("open");
}

function handleInviteOverlay(e) {
  if (e.target === document.getElementById("invite-overlay"))
    closeInviteModal();
}

function validateInviteNickname() {
  const value = document.getElementById("invite-nickname-input").value.trim();
  const hint = document.getElementById("invite-hint");
  const btn = document.getElementById("btn-invite-send");

  if (!value) {
    hint.textContent = "";
    hint.className = "invite-hint info";
    btn.disabled = true;
    return;
  }

  const already = members.find((m) => m.nickname === value);
  if (already) {
    hint.textContent = "이미 프로젝트에 참가 중인 멤버입니다.";
    hint.className = "invite-hint fail";
    btn.disabled = true;
    return;
  }
  if (value === currentUser.nickname) {
    hint.textContent = "자기 자신은 초대할 수 없습니다.";
    hint.className = "invite-hint fail";
    btn.disabled = true;
    return;
  }

  hint.textContent = `"${value}" 에게 초대를 보냅니다.`;
  hint.className = "invite-hint ok";
  btn.disabled = false;
}

async function sendInvite() {
  const token = sessionStorage.getItem("access_token");
  const nickname = document
    .getElementById("invite-nickname-input")
    .value.trim();
  const hint = document.getElementById("invite-hint");
  if (!nickname) return;

  try {
    const res = await fetch(`/api/request_invite_send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ project_id: projectInfo.id, nickname }),
    });
    const data = await res.json();
    if (!data.success) {
      hint.textContent = data.message || "초대 실패";
      hint.className = "invite-hint fail";
      return;
    }

    hint.textContent = `✓ "${nickname}" 에게 초대를 보냈습니다!`;
    hint.className = "invite-hint ok";
    document.getElementById("btn-invite-send").disabled = true;
    document.getElementById("invite-nickname-input").value = "";
    setTimeout(closeInviteModal, 1200);
  } catch (e) {
    hint.textContent = "서버와 연결할 수 없습니다.";
    hint.className = "invite-hint fail";
  }
}

// ── 프로젝트 삭제 모달 ───────────────────────────────────────
function openDeleteModal() {
  document.getElementById("delete-overlay").classList.add("open");
  document.getElementById("delete-input").value = "";
  document.getElementById("btn-delete-confirm").classList.remove("ready");
  document.getElementById("delete-input").focus();
}

function closeDeleteModal() {
  document.getElementById("delete-overlay").classList.remove("open");
}

function handleDeleteOverlay(e) {
  if (e.target === document.getElementById("delete-overlay"))
    closeDeleteModal();
}

async function confirmDelete() {
  if (document.getElementById("delete-input").value !== "삭제") return;
  const token = sessionStorage.getItem("access_token");

  try {
    const res = await fetch(`/api/request_project_delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ project_id: projectInfo.id }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || "삭제 실패");
      return;
    }

    clearInterval(pollTimer);
    window.location.href = "project.html";
  } catch (e) {
    alert("서버와 연결할 수 없습니다.");
  }
}

// ── 유틸 ─────────────────────────────────────────────────────
function escHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function getInitials(nickname) {
  if (!nickname) return "?";
  return nickname.slice(0, /[가-힣]/.test(nickname) ? 1 : 2).toUpperCase();
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDeleteModal();
    closeLogPanel();
    closeInviteModal();
  }
});
