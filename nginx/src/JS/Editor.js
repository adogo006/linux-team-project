// ── editor.js ──

// ── Mock 데이터 ───────────────────────────────────────────────
const currentUser = { username: "dev_user", nickname: "개발자", role: "owner" };
const projectInfo = { id: 1, name: "Auth Service" };

const members = [
  { username: "dev_user", nickname: "개발자", role: "owner" },
  { username: "alice", nickname: "Alice", role: "member" },
  { username: "bob", nickname: "Bob", role: "member" },
  { username: "charlie", nickname: "Charlie", role: "member" },
  { username: "dana", nickname: "Dana", role: "member" },
];

const fileTree = [
  {
    type: "folder",
    name: "src",
    open: true,
    children: [
      {
        type: "folder",
        name: "auth",
        open: true,
        children: [
          { type: "file", name: "AuthController.java", editingBy: "alice" },
          { type: "file", name: "AuthService.java", editingBy: null },
          { type: "file", name: "JwtUtil.java", editingBy: null },
        ],
      },
      {
        type: "folder",
        name: "config",
        open: false,
        children: [
          { type: "file", name: "SecurityConfig.java", editingBy: null },
        ],
      },
      { type: "file", name: "Application.java", editingBy: null },
    ],
  },
  {
    type: "folder",
    name: "resources",
    open: false,
    children: [{ type: "file", name: "application.yml", editingBy: "bob" }],
  },
  { type: "file", name: "build.gradle", editingBy: null },
  { type: "file", name: "README.md", editingBy: null },
];

const fileCodes = {
  "AuthController.java": `package com.codesync.auth.controller;

import com.codesync.auth.service.AuthService;
import com.codesync.auth.dto.LoginRequest;
import com.codesync.auth.dto.LoginResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @RequestBody LoginRequest request) {
        LoginResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/register")
    public ResponseEntity<Void> register(
            @RequestBody RegisterRequest request) {
        authService.register(request);
        return ResponseEntity.ok().build();
    }
}`,
  "JwtUtil.java": `package com.codesync.auth.util;

import io.jsonwebtoken.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.util.Date;

@Component
public class JwtUtil {

    @Value("\${jwt.secret}")
    private String secret;

    @Value("\${jwt.expiration}")
    private long expiration;

    public String generateToken(String username) {
        return Jwts.builder()
                .setSubject(username)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(SignatureAlgorithm.HS256, secret)
                .compact();
    }

    public String extractUsername(String token) {
        return Jwts.parser()
                .setSigningKey(secret)
                .parseClaimsJws(token)
                .getBody()
                .getSubject();
    }
}`,
  "README.md": `# Auth Service

MSA 기반 CodeSync 프로젝트의 인증 서비스입니다.

## 기술 스택
- Spring Boot 3.x
- Spring Security + JWT
- MySQL / Redis

## 실행 방법
\`\`\`bash
./gradlew bootRun
\`\`\``,
  "application.yml": `spring:
  datasource:
    url: jdbc:mysql://localhost:3306/codesync
    username: root
    password: \${DB_PASSWORD}

jwt:
  secret: \${JWT_SECRET}
  expiration: 86400000

server:
  port: 8081`,
};

// ── 수정 로그 저장소 ─────────────────────────────────────────
// { filename: [ { who, when, diff: [{type, line, content}] }, ... ] }
const editLogs = {};

// ── 상태 ──────────────────────────────────────────────────────
let activeFile = null;
let isEditingNow = false;
let codeSnapshot = ""; // 수정 시작 시점의 코드 스냅샷

// ── 초기화 ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  renderNav();
  renderUsers();
  renderFileTree();
  showEmpty();

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
});

// ── 네비게이션 ───────────────────────────────────────────────
function renderNav() {
  document.getElementById("nav-project-name").textContent = projectInfo.name;

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

  // 프로젝트장
  if (owner) {
    const isMe = owner.username === currentUser.username;
    const initials = getInitials(owner.nickname);
    html += `
      <div class="role-group">
        <div class="role-label">프로젝트장</div>
        <div class="user-item">
          <div class="user-avatar owner">${initials}</div>
          <div class="user-info">
            <div class="user-name">
              ${escHtml(owner.nickname)}
              ${isMe ? '<span style="color:var(--text-dim);font-size:10px"> (나)</span>' : ""}
              <span class="owner-crown" title="프로젝트장">👑</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  // 일반 멤버
  if (rest.length > 0) {
    html += `<div class="role-group"><div class="role-label">멤버</div>`;
    for (const m of rest) {
      const isMe = m.username === currentUser.username;
      const initials = getInitials(m.nickname);
      const canKick = currentUser.role === "owner" && !isMe;
      html += `
        <div class="user-item" id="user-${m.username}">
          <div class="user-avatar member">${initials}</div>
          <div class="user-info">
            <div class="user-name">
              ${escHtml(m.nickname)}
              ${isMe ? '<span style="color:var(--text-dim);font-size:10px"> (나)</span>' : ""}
            </div>
          </div>
          ${canKick ? `<button class="user-menu-btn" onclick="openUserMenu(event,'${m.username}')">⋯</button>` : ""}
        </div>`;
    }
    html += "</div>";
  }

  list.innerHTML = html;

  // 프로젝트장만 하단 버튼 노출
  const bottom = document.getElementById("panel-bottom");
  if (currentUser.role === "owner") {
    bottom.style.display = "flex";
  } else {
    bottom.style.display = "none";
  }
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
    const nodePath = parentPath ? `${parentPath}::${node.name}` : node.name;

    if (node.type === "folder") {
      const arrow = node.open ? "▾" : "▸";
      html += `
        <div class="tree-item folder ${indent}" onclick="toggleFolder('${nodePath}')">
          <span class="tree-icon">${arrow}</span>
          <span class="tree-name">${escHtml(node.name)}</span>
          <span class="tree-add-btn"
                onclick="event.stopPropagation(); openTreeCtx(event,'${nodePath}')"
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
        <div class="tree-item file ${indent} ${activeFile?.name === node.name ? "active" : ""}"
             onclick="openFile('${escHtml(node.name)}')">
          <span class="tree-icon">${icon}</span>
          <span class="tree-name">${escHtml(node.name)}</span>
          ${editTag}
        </div>`;
    }
  }
  return html;
}

function findNodeByPath(path) {
  const parts = path.split("::");
  let nodes = fileTree,
    node = null;
  for (const part of parts) {
    node = nodes.find((n) => n.name === part);
    if (!node) return null;
    if (node.children) nodes = node.children;
  }
  return node;
}

function toggleFolder(path) {
  const node = findNodeByPath(path);
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
function openFile(filename) {
  const node = findNode(fileTree, filename);
  if (!node) return;

  // 수정 중이면 완료 처리
  if (isEditingNow && activeFile) finishEdit(false);

  activeFile = node;
  renderFileTree();
  renderTabs();
  renderToolbar();
  renderCode();
}

function findNode(nodes, filename) {
  for (const n of nodes) {
    if (n.type === "file" && n.name === filename) return n;
    if (n.children) {
      const found = findNode(n.children, filename);
      if (found) return found;
    }
  }
  return null;
}

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
  const color = colorMap[ext] || "#6b7280";
  tabs.innerHTML = `
    <div class="editor-tab active">
      <span class="tab-dot" style="background:${color}"></span>
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
    activeFile.editingBy && activeFile.editingBy !== currentUser.username;
  const isMeEditing = activeFile.editingBy === currentUser.username;

  const logCount = (editLogs[activeFile.name] || []).length;
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

  const code = fileCodes[activeFile.name] || "";
  const lines = code.split("\n");
  const lineNums = lines.map((_, i) => i + 1).join("\n");
  const isMeEditing = activeFile.editingBy === currentUser.username;
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
  fileCodes[activeFile.name] = editor.value;
}

// ── 수정 토글 ────────────────────────────────────────────────
function toggleEdit() {
  if (!activeFile) return;
  if (isEditingNow) {
    finishEdit(true);
  } else {
    // 수정 시작 — 스냅샷 저장
    codeSnapshot = fileCodes[activeFile.name] || "";
    activeFile.editingBy = currentUser.username;
    isEditingNow = true;
    renderFileTree();
    renderToolbar();
    renderCode();
    document.getElementById("code-editor")?.focus();
  }
}

function finishEdit(saveLog) {
  if (!activeFile) return;
  const newCode = fileCodes[activeFile.name] || "";

  if (saveLog) {
    const diff = computeDiff(codeSnapshot, newCode);
    if (diff.length > 0) {
      if (!editLogs[activeFile.name]) editLogs[activeFile.name] = [];
      editLogs[activeFile.name].push({
        who: currentUser.nickname,
        when: new Date(),
        diff,
      });
    }
  }

  activeFile.editingBy = null;
  isEditingNow = false;
  codeSnapshot = "";
  renderFileTree();
  renderToolbar();
  renderCode();
}

// ── Diff 계산 ─────────────────────────────────────────────────
// 줄 단위 Myers diff (간소화 버전)
// 반환: [{ type: 'add'|'del'|'mod', line: number, content: string }, ...]
function computeDiff(oldCode, newCode) {
  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");
  const result = [];

  const lcs = buildLCS(oldLines, newLines);
  let oi = 0,
    ni = 0,
    li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (
      oi < oldLines.length &&
      ni < newLines.length &&
      li < lcs.length &&
      oldLines[oi] === lcs[li] &&
      newLines[ni] === lcs[li]
    ) {
      // 공통 줄 — 변화 없음
      oi++;
      ni++;
      li++;
    } else if (
      ni < newLines.length &&
      (li >= lcs.length || newLines[ni] !== lcs[li])
    ) {
      // 추가된 줄
      result.push({ type: "add", line: ni + 1, content: newLines[ni] });
      ni++;
    } else if (
      oi < oldLines.length &&
      (li >= lcs.length || oldLines[oi] !== lcs[li])
    ) {
      // 삭제된 줄
      result.push({ type: "del", line: oi + 1, content: oldLines[oi] });
      oi++;
    } else {
      oi++;
      ni++;
    }
  }

  return result;
}

function buildLCS(a, b) {
  const m = a.length,
    n = b.length;
  // 메모리 절약을 위해 500줄 이상이면 간소화
  if (m > 500 || n > 500) return [];
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const lcs = [];
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return lcs;
}

// ── 수정 로그 패널 ────────────────────────────────────────────
function openLogPanel() {
  if (!activeFile) return;
  const logs = editLogs[activeFile.name] || [];
  const overlay = document.getElementById("log-overlay");
  const content = document.getElementById("log-content");
  const title = document.getElementById("log-title");

  title.textContent = `수정 로그 — ${activeFile.name}`;

  if (logs.length === 0) {
    content.innerHTML = `<div class="log-empty">아직 수정 기록이 없습니다.</div>`;
  } else {
    content.innerHTML = [...logs]
      .reverse()
      .map((log, i) => {
        const timeStr = formatTime(log.when);
        const adds = log.diff.filter((d) => d.type === "add").length;
        const dels = log.diff.filter((d) => d.type === "del").length;
        const diffHTML = log.diff
          .map(
            (d) => `
        <div class="diff-line ${d.type}">
          <span class="diff-lnum">${d.line}</span>
          <span class="diff-prefix">${d.type === "add" ? "+" : "-"}</span>
          <span class="diff-content">${escHtml(d.content)}</span>
        </div>`,
          )
          .join("");

        return `
        <div class="log-entry" id="log-entry-${i}">
          <div class="log-entry-header" onclick="toggleLogEntry(${i})">
            <div class="log-entry-who">
              <span class="log-avatar">${getInitials(log.who)}</span>
              <span class="log-nickname">${escHtml(log.who)}</span>
            </div>
            <div class="log-entry-meta">
              <span class="log-stat add">+${adds}</span>
              <span class="log-stat del">-${dels}</span>
              <span class="log-time">${timeStr}</span>
              <span class="log-arrow" id="log-arrow-${i}">▾</span>
            </div>
          </div>
          <div class="log-diff" id="log-diff-${i}">
            <div class="diff-block">${diffHTML}</div>
          </div>
        </div>`;
      })
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

function formatTime(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// ── 파일/폴더 추가 ───────────────────────────────────────────
function addFile(folderPath) {
  const name = prompt("파일 이름을 입력하세요 (예: MyClass.java)");
  if (!name?.trim()) return;
  const node = { type: "file", name: name.trim(), editingBy: null };
  if (!folderPath) {
    fileTree.push(node);
  } else {
    const folder = findNodeByPath(folderPath);
    if (folder?.type === "folder") {
      folder.children.push(node);
      folder.open = true;
    }
  }
  renderFileTree();
}

function addFolder(folderPath) {
  const name = prompt("폴더 이름을 입력하세요");
  if (!name?.trim()) return;
  const node = { type: "folder", name: name.trim(), open: true, children: [] };
  if (!folderPath) {
    fileTree.push(node);
  } else {
    const folder = findNodeByPath(folderPath);
    if (folder?.type === "folder") {
      folder.children.push(node);
      folder.open = true;
    }
  }
  renderFileTree();
}

// ── 컨텍스트 메뉴 ────────────────────────────────────────────
function openTreeCtx(e, folderPath) {
  e.stopPropagation();
  closeCtxMenu();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.id = "ctx-menu";
  menu.innerHTML = `
    <div class="ctx-item" onclick="addFile('${folderPath}'); closeCtxMenu()">📄 파일 추가</div>
    <div class="ctx-item" onclick="addFolder('${folderPath}'); closeCtxMenu()">📁 폴더 추가</div>`;
  const { x, y } = calcMenuPos(e, 170, 80);
  menu.style.top = y + "px";
  menu.style.left = x + "px";
  document.body.appendChild(menu);
  setTimeout(
    () => document.addEventListener("click", closeCtxMenu, { once: true }),
    0,
  );
}

function openUserMenu(e, username) {
  e.stopPropagation();
  closeCtxMenu();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.id = "ctx-menu";
  menu.innerHTML = ctxItem(
    "프로젝트에서 추방",
    () => kickMember(username),
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
function ctxSep() {
  return '<div class="ctx-sep"></div>';
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

function kickMember(username) {
  const idx = members.findIndex((m) => m.username === username);
  if (idx !== -1) {
    members.splice(idx, 1);
    renderUsers();
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

function confirmDelete() {
  if (document.getElementById("delete-input").value !== "삭제") return;
  // TODO: API 연결
  alert("[DEV] 프로젝트가 삭제되었습니다.");
  window.location.href = "project.html";
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

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDeleteModal();
    closeLogPanel();
  }
});

// ── 사용자 초대 모달 ─────────────────────────────────────────
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

// 닉네임 입력할 때마다 실시간 확인
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

  // 이미 참가 중인 멤버인지 확인
  const already = members.find((m) => m.nickname === value);
  if (already) {
    hint.textContent = "이미 프로젝트에 참가 중인 멤버입니다.";
    hint.className = "invite-hint fail";
    btn.disabled = true;
    return;
  }

  // 자기 자신인지 확인
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

function sendInvite() {
  const nickname = document
    .getElementById("invite-nickname-input")
    .value.trim();
  const hint = document.getElementById("invite-hint");

  if (!nickname) return;

  // TODO: API 연결
  // await request_invite(token, projectId, nickname);

  // [DEV] Mock — 실제로는 상대방 초대목록에 들어가는 것이라 내 화면엔 변화 없음
  hint.textContent = `✓ "${nickname}" 에게 초대를 보냈습니다!`;
  hint.className = "invite-hint ok";
  document.getElementById("btn-invite-send").disabled = true;
  document.getElementById("invite-nickname-input").value = "";

  setTimeout(closeInviteModal, 1200);
}
