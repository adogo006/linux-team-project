// ── editor.js ──

// ── Mock 데이터 ───────────────────────────────────────────────

// URL에서 projectId 파싱 (추후 API 연동 시 사용)
// const params = new URLSearchParams(window.location.search);
// const projectId = params.get('id');

const currentUser = { username: "dev_user", nickname: "개발자", role: "owner" };
// role: 'owner' | 'leader' | 'member'

const projectInfo = { id: 1, name: "Auth Service" };

const members = [
  { username: "dev_user", nickname: "개발자", role: "owner" },
  { username: "alice", nickname: "Alice", role: "leader" },
  { username: "bob", nickname: "Bob", role: "leader" },
  { username: "charlie", nickname: "Charlie", role: "member" },
  { username: "dana", nickname: "Dana", role: "member" },
  { username: "evan", nickname: "Evan", role: "member" },
];

// 파일 트리 구조
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
          {
            type: "file",
            name: "AuthController.java",
            editingBy: "alice",
            access: ["dev_user", "alice", "bob"],
          },
          {
            type: "file",
            name: "AuthService.java",
            editingBy: null,
            access: ["dev_user", "alice"],
          },
          {
            type: "file",
            name: "JwtUtil.java",
            editingBy: null,
            access: ["dev_user"],
          },
        ],
      },
      {
        type: "folder",
        name: "config",
        open: false,
        children: [
          {
            type: "file",
            name: "SecurityConfig.java",
            editingBy: null,
            access: ["dev_user"],
          },
        ],
      },
      {
        type: "file",
        name: "Application.java",
        editingBy: null,
        access: ["dev_user"],
      },
    ],
  },
  {
    type: "folder",
    name: "resources",
    open: false,
    children: [
      {
        type: "file",
        name: "application.yml",
        editingBy: "bob",
        access: ["dev_user", "alice", "bob", "charlie"],
      },
    ],
  },
  { type: "file", name: "build.gradle", editingBy: null, access: ["dev_user"] },
  {
    type: "file",
    name: "README.md",
    editingBy: null,
    access: ["dev_user", "alice", "bob", "charlie", "dana", "evan"],
  },
];

// 파일별 Mock 코드
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
\`\`\`

## API 엔드포인트
| Method | Path | 설명 |
|--------|------|------|
| POST | /api/auth/login | 로그인 |
| POST | /api/auth/register | 회원가입 |
| GET  | /api/auth/check-username | 아이디 중복확인 |`,
  "application.yml": `spring:
  datasource:
    url: jdbc:mysql://localhost:3306/codesync
    username: root
    password: \${DB_PASSWORD}
    driver-class-name: com.mysql.cj.jdbc.Driver

  jpa:
    hibernate:
      ddl-auto: update
    show-sql: false

jwt:
  secret: \${JWT_SECRET}
  expiration: 86400000  # 24h

server:
  port: 8081`,
};

// ── 상태 ──────────────────────────────────────────────────────
let activeFile = null; // 현재 열린 파일 객체
let isEditingNow = false; // 내가 수정 중인지

// ── 초기화 ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  renderNav();
  renderUsers();
  renderFileTree();
  showEmpty();
});

// ── 네비게이션 ───────────────────────────────────────────────
function renderNav() {
  document.getElementById("nav-project-name").textContent = projectInfo.name;

  const badge = document.getElementById("nav-role-badge");
  const roleMap = {
    owner: ["프로젝트장", "owner"],
    leader: ["팀장", "leader"],
    member: ["일반", "member"],
  };
  const [label, cls] = roleMap[currentUser.role];
  badge.textContent = label;
  badge.className = `nav-role-badge ${cls}`;
}

// ── 사용자 목록 ──────────────────────────────────────────────
function renderUsers() {
  const list = document.getElementById("user-list");

  const roleOrder = { owner: 0, leader: 1, member: 2 };
  const sorted = [...members].sort((a, b) => {
    if (roleOrder[a.role] !== roleOrder[b.role])
      return roleOrder[a.role] - roleOrder[b.role];
    return a.nickname.localeCompare(b.nickname, "ko");
  });

  const groups = { owner: [], leader: [], member: [] };
  sorted.forEach((m) => groups[m.role].push(m));

  const groupMeta = {
    owner: { label: "프로젝트장", show: true },
    leader: { label: "팀장", show: groups.leader.length > 0 },
    member: { label: "일반", show: groups.member.length > 0 },
  };

  let html = "";
  for (const role of ["owner", "leader", "member"]) {
    if (!groupMeta[role].show) continue;
    html += `<div class="role-group">
      <div class="role-label">${groupMeta[role].label}</div>`;
    for (const m of groups[role]) {
      const initials = m.nickname.slice(0, 2).toUpperCase();
      const canManage =
        currentUser.role === "owner" ||
        (currentUser.role === "leader" && role === "member");
      const isMe = m.username === currentUser.username;
      html += `
        <div class="user-item" id="user-${m.username}">
          <div class="user-avatar ${role}">${initials}</div>
          <div class="user-info">
            <div class="user-name">${escHtml(m.nickname)}${isMe ? ' <span style="color:var(--text-dim);font-size:10px">(나)</span>' : ""}</div>
            ${role !== "member" ? `<div class="user-role-tag ${role}">${groupMeta[role].label}</div>` : ""}
          </div>
          ${canManage && !isMe ? `<button class="user-menu-btn" onclick="openUserMenu(event, '${m.username}', '${role}')">⋯</button>` : ""}
        </div>`;
    }
    html += "</div>";
  }

  list.innerHTML = html;

  // 장만 프로젝트 삭제 버튼 노출
  document.getElementById("danger-zone").style.display =
    currentUser.role === "owner" ? "block" : "none";
}

// ── 파일 트리 ────────────────────────────────────────────────
function renderFileTree() {
  const tree = document.getElementById("file-tree");
  tree.innerHTML = buildTreeHTML(fileTree, 0, "");
}

function buildTreeHTML(nodes, depth, parentPath) {
  let html = "";
  const indent = depth > 0 ? `indent-${Math.min(depth, 3)}` : "";

  for (const node of nodes) {
    const nodePath = parentPath ? `${parentPath}::${node.name}` : node.name;
    const safeId = nodePath.replace(/[^a-zA-Z0-9가-힣_\-]/g, "_");

    if (node.type === "folder") {
      const arrow = node.open ? "▾" : "▸";
      html += `
        <div class="tree-item folder ${indent}" id="folder-${safeId}"
             onclick="toggleFolder('${nodePath}')">
          <span class="tree-icon">${arrow}</span>
          <span class="tree-name">${escHtml(node.name)}</span>
          <span class="tree-add-btn"
                onclick="event.stopPropagation(); openTreeCtx(event, '${nodePath}')"
                title="이 폴더에 추가">+</span>
        </div>`;
      if (node.open && node.children) {
        html += buildTreeHTML(node.children, depth + 1, nodePath);
      }
    } else {
      const ext = node.name.split(".").pop();
      const icon = fileIcon(ext);
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

// path = 'src::auth' 같은 :: 구분자 경로로 폴더 노드 탐색
function findNodeByPath(path) {
  const parts = path.split("::");
  let nodes = fileTree;
  let node = null;
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

// 폴더의 + 버튼 → 컨텍스트 메뉴
function openTreeCtx(e, folderPath) {
  e.stopPropagation();
  closeCtxMenu();

  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.id = "ctx-menu";
  menu.innerHTML = `
    <div class="ctx-item" onclick="addFile('${folderPath}'); closeCtxMenu()">📄 파일 추가</div>
    <div class="ctx-item" onclick="addFolder('${folderPath}'); closeCtxMenu()">📁 폴더 추가</div>
  `;
  menu.style.top = e.clientY + "px";
  menu.style.left = e.clientX + "px";
  document.body.appendChild(menu);
  setTimeout(
    () => document.addEventListener("click", closeCtxMenu, { once: true }),
    0,
  );
}

function findNode(nodes, name, type) {
  for (const n of nodes) {
    if (n.name === name && n.type === type) return n;
    if (n.children) {
      const found = findNode(n.children, name, type);
      if (found) return found;
    }
  }
  return null;
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
  const node = findNode(fileTree, filename, "file");
  if (!node) return;

  // 이전 수정 상태 해제
  if (isEditingNow && activeFile) {
    activeFile.editingBy = null;
    isEditingNow = false;
  }

  activeFile = node;
  renderFileTree();
  renderTabs();
  renderToolbar();
  renderCode();
}

function renderTabs() {
  const tabs = document.getElementById("editor-tabs");
  if (!activeFile) {
    tabs.innerHTML = "";
    return;
  }

  const ext = activeFile.name.split(".").pop();
  const color =
    {
      java: "#f97316",
      js: "#facc15",
      ts: "#3b82f6",
      html: "#22c55e",
      css: "#a78bfa",
      md: "#6b7280",
      yml: "#6b7280",
      gradle: "#22c55e",
    }[ext] || "#6b7280";

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

  const canToggleAccess =
    currentUser.role === "owner" || currentUser.role === "leader";
  const isEditingByOther =
    activeFile.editingBy && activeFile.editingBy !== currentUser.username;
  const isMeEditing = activeFile.editingBy === currentUser.username;

  // 권한 부여 칩 (팀장·장만)
  let accessChips = "";
  if (canToggleAccess) {
    const memberChips = members
      .filter((m) => m.username !== currentUser.username && m.role === "member")
      .map((m) => {
        const granted = activeFile.access.includes(m.username);
        return `<span class="access-user-chip ${granted ? "granted" : ""}"
                      onclick="toggleAccess('${m.username}')"
                      title="${granted ? "권한 제거" : "권한 부여"}">
                  @${escHtml(m.nickname)}
                </span>`;
      })
      .join("");
    if (memberChips) {
      accessChips = `<span class="access-label">접근 권한:</span>${accessChips ? accessChips : memberChips}`;
    }
  }

  // 수정 버튼 상태
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
    <div class="access-toggle">${accessChips}</div>
    ${editBtn}`;
}

function renderCode() {
  const area = document.getElementById("code-area");
  if (!activeFile) {
    area.innerHTML = emptyState();
    return;
  }

  const code = fileCodes[activeFile.name] || "// 파일 내용이 없습니다.";
  const lines = code.split("\n");
  const lineNums = lines.map((_, i) => i + 1).join("\n");

  const isEditingByOther =
    activeFile.editingBy && activeFile.editingBy !== currentUser.username;
  const isMeEditing = activeFile.editingBy === currentUser.username;
  const canEdit =
    isMeEditing && activeFile.access.includes(currentUser.username);

  area.innerHTML = `
    <div class="line-numbers" id="line-numbers">${lineNums}</div>
    <textarea class="code-editor" id="code-editor"
      ${!canEdit ? "disabled" : ""}
      spellcheck="false"
      oninput="syncLineNumbers()"
    >${escHtml(code)}</textarea>`;

  // 줄번호 동기화 스크롤
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
  if (!editor) return;
  const lines = editor.value.split("\n");
  const nums = document.getElementById("line-numbers");
  if (nums) nums.textContent = lines.map((_, i) => i + 1).join("\n");

  // Mock 저장 (실제 API 연결 시 교체)
  if (activeFile) fileCodes[activeFile.name] = editor.value;
}

// ── 수정 토글 ────────────────────────────────────────────────
function toggleEdit() {
  if (!activeFile) return;

  if (isEditingNow) {
    // 수정 완료
    activeFile.editingBy = null;
    isEditingNow = false;
  } else {
    // 수정 시작
    activeFile.editingBy = currentUser.username;
    isEditingNow = true;
  }

  renderFileTree();
  renderToolbar();
  renderCode();
}

// ── 접근 권한 토글 ───────────────────────────────────────────
function toggleAccess(username) {
  if (!activeFile) return;
  const idx = activeFile.access.indexOf(username);
  if (idx === -1) {
    activeFile.access.push(username);
  } else {
    activeFile.access.splice(idx, 1);
  }
  renderToolbar();
}

// ── 파일/폴더 추가 ───────────────────────────────────────────
// folderPath: null → 루트에 추가 / 'src::auth' → 해당 폴더 하위에 추가
function addFile(folderPath) {
  const name = prompt("파일 이름을 입력하세요 (예: MyClass.java)");
  if (!name || !name.trim()) return;
  const newNode = {
    type: "file",
    name: name.trim(),
    editingBy: null,
    access: [currentUser.username],
  };

  if (!folderPath) {
    fileTree.push(newNode);
  } else {
    const folder = findNodeByPath(folderPath);
    if (folder && folder.type === "folder") {
      folder.children.push(newNode);
      folder.open = true;
    }
  }
  renderFileTree();
}

function addFolder(folderPath) {
  const name = prompt("폴더 이름을 입력하세요");
  if (!name || !name.trim()) return;
  const newNode = {
    type: "folder",
    name: name.trim(),
    open: true,
    children: [],
  };

  if (!folderPath) {
    fileTree.push(newNode);
  } else {
    const folder = findNodeByPath(folderPath);
    if (folder && folder.type === "folder") {
      folder.children.push(newNode);
      folder.open = true;
    }
  }
  renderFileTree();
}

// ── 사용자 컨텍스트 메뉴 ─────────────────────────────────────
function openUserMenu(e, username, role) {
  e.stopPropagation();
  closeCtxMenu();

  const member = members.find((m) => m.username === username);
  if (!member) return;

  let items = "";
  if (currentUser.role === "owner") {
    if (role === "member") {
      items += ctxItem("팀장으로 승급", () => promoteMember(username));
    }
    if (role === "leader") {
      items += ctxItem("일반으로 강등", () => demoteMember(username));
    }
    items += ctxSep();
    items += ctxItem("프로젝트에서 추방", () => kickMember(username), true);
  } else if (currentUser.role === "leader" && role === "member") {
    items += ctxItem("팀장 권한 부여", () => promoteMember(username));
    items += ctxSep();
    items += ctxItem("프로젝트에서 추방", () => kickMember(username), true);
  }

  if (!items) return;

  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.id = "ctx-menu";
  menu.innerHTML = items;
  menu.style.top = e.clientY + "px";
  menu.style.left = e.clientX + "px";
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

function promoteMember(username) {
  const m = members.find((m) => m.username === username);
  if (m) {
    m.role = "leader";
    renderUsers();
  }
}
function demoteMember(username) {
  const m = members.find((m) => m.username === username);
  if (m) {
    m.role = "member";
    renderUsers();
  }
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

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("delete-input");
  if (input) {
    input.addEventListener("input", () => {
      const btn = document.getElementById("btn-delete-confirm");
      if (input.value === "삭제") {
        btn.classList.add("ready");
      } else {
        btn.classList.remove("ready");
      }
    });
  }
});

function confirmDelete() {
  const input = document.getElementById("delete-input");
  if (input.value !== "삭제") return;

  // TODO: API 연결
  // await fetch(`http://YOUR_API_URL/api/projects/${projectInfo.id}`, { method: 'DELETE' });
  alert("[DEV] 프로젝트가 삭제되었습니다. (Mock)");
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

function handleDeleteOverlay(e) {
  if (e.target === document.getElementById("delete-overlay"))
    closeDeleteModal();
}

// ── 프로젝트 진입 ─────────────────────────────────────────────
function openProject(id) {
  window.location.href = `editor.html?id=${id}`;
}

// ESC 키로 모달 닫기
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDeleteModal();
});
