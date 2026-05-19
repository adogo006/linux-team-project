// ── project.js ──

const API_BASE = "http://YOUR_API_URL";

// ── API 함수 ──────────────────────────────────────────────────

// 프로젝트 목록 조회
async function request_get_projects(token) {
  const res = await fetch(`${API_BASE}/api:8000/request_project_list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!data.success) throw new Error("FETCH_FAILED");
  return data.projects; // [{ project_id, project_name, role }, ...]
}

// 프로젝트 생성
async function request_create_project(token, project_name) {
  const res = await fetch(`${API_BASE}/api:8000/request_project_create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ project_name }),
  });
  const data = await res.json();
  if (!data.success) throw new Error("CREATE_FAILED");
  return data; // { project_id, ... }
}

// 초대 목록 조회
async function request_get_invites(token) {
  const res = await fetch(`${API_BASE}/api:8000/request_invite_list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!data.success) throw new Error("FETCH_FAILED");
  return data.invites; // [{ invite_id, project_id, project_name }, ...]
}

// 초대 수락 / 거절
async function request_respond_invite(token, project_id, action) {
  const res = await fetch(`${API_BASE}/api:8000/request_invite_respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ project_id, action }), // action: "ACCEPT" | "REJECT"
  });
  const data = await res.json();
  if (!data.success) throw new Error("RESPOND_FAILED");
}

// ── 상태 ─────────────────────────────────────────────────────
let myProjects = [];
let invites = [];

// ── 초기화 ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const token = sessionStorage.getItem("access_token");

  if (!token) {
    window.location.href = "Login.html";
    return;
  }

  // 로그인 시 저장해둔 닉네임 바로 사용 (JWT 파싱 불필요)
  const nickname = sessionStorage.getItem("nickname") || "";
  document.getElementById("nav-username").textContent = nickname;
  document.getElementById("nav-avatar").textContent = getInitials(nickname);

  await loadProjects(token);
  await loadInvites(token);
});

// ── 데이터 로드 ───────────────────────────────────────────────
async function loadProjects(token) {
  try {
    myProjects = await request_get_projects(token);
    renderProjects();
  } catch (e) {
    console.error("프로젝트 목록 로드 실패:", e);
  }
}

async function loadInvites(token) {
  try {
    invites = await request_get_invites(token);
    renderInvites();
  } catch (e) {
    console.error("초대 목록 로드 실패:", e);
  }
}

// ── 프로젝트 렌더링 ───────────────────────────────────────────
function renderProjects() {
  const grid = document.getElementById("projects-grid");
  document.getElementById("project-count").textContent =
    `${myProjects.length}개`;

  const cards = myProjects
    .map(
      (p, i) => `
    <div class="project-card" style="animation-delay:${i * 0.06}s" onclick="openProject('${p.project_id}')">
      <div class="project-info">
        <div class="project-name">${escHtml(p.project_name)}</div>
      </div>
      <div class="project-meta">
        <div class="project-owner">
          <span class="owner-dot"></span>
          ${escHtml(p.role === "Root" ? "방장" : "멤버")}
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  const addBtn = `
    <div class="project-add" onclick="openModal()">
      <div class="add-circle">+</div>
      <span class="add-label">새 프로젝트</span>
    </div>
  `;

  grid.innerHTML = cards + addBtn;
}

// ── 초대 목록 렌더링 ──────────────────────────────────────────
function renderInvites() {
  const list = document.getElementById("invite-list");
  const badge = document.getElementById("invite-count");
  badge.textContent = invites.length;

  if (invites.length === 0) {
    list.innerHTML = `<div class="sidebar-empty">// 받은 초대가 없습니다</div>`;
    return;
  }

  list.innerHTML = invites
    .map(
      (inv, i) => `
    <div class="invite-card" style="animation-delay:${i * 0.08}s" id="invite-${inv.project_id}">
      <div class="invite-project">${escHtml(inv.project_name)}</div>
      <div class="invite-actions">
        <button class="btn-accept"  onclick="respondInvite('${inv.project_id}', 'ACCEPT')">수락</button>
        <button class="btn-decline" onclick="respondInvite('${inv.project_id}', 'REJECT')">거절</button>
      </div>
    </div>
  `,
    )
    .join("");
}

// ── 초대 수락 / 거절 ──────────────────────────────────────────
async function respondInvite(project_id, action) {
  const token = sessionStorage.getItem("access_token");
  const card = document.getElementById(`invite-${project_id}`);

  if (card) card.querySelectorAll("button").forEach((b) => (b.disabled = true));

  try {
    await request_respond_invite(token, project_id, action);

    invites = invites.filter((i) => i.project_id !== project_id);

    if (action === "ACCEPT") await loadProjects(token);

    renderInvites();
  } catch (e) {
    console.error("초대 응답 실패:", e);
    if (card)
      card.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}

// ── 모달 열기 / 닫기 ─────────────────────────────────────────
function openModal() {
  document.getElementById("modal-overlay").classList.add("open");
  document.getElementById("proj-name").focus();
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.getElementById("proj-name").value = "";
  document.getElementById("proj-desc").value = "";
  document.getElementById("modal-status").textContent = "";
  document.getElementById("modal-status").className = "modal-status";
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
}

// ── 프로젝트 생성 ─────────────────────────────────────────────
async function createProject() {
  const token = sessionStorage.getItem("access_token");
  const name = document.getElementById("proj-name").value.trim();
  const status = document.getElementById("modal-status");

  if (!name) {
    status.textContent = "프로젝트 명을 입력해주세요.";
    status.className = "modal-status error";
    return;
  }

  status.textContent = "생성 중...";
  status.className = "modal-status";

  try {
    const result = await request_create_project(token, name);

    // 새 프로젝트를 목록에 바로 추가
    myProjects.push({
      project_id: result.project_id,
      project_name: name,
      role: "Root",
    });

    status.textContent = "✓ 프로젝트가 생성되었습니다!";
    status.className = "modal-status success";
    renderProjects();
    setTimeout(closeModal, 1000);
  } catch (e) {
    status.textContent = "프로젝트 생성에 실패했습니다. 다시 시도해주세요.";
    status.className = "modal-status error";
  }
}

// ── 프로젝트 진입 ─────────────────────────────────────────────
function openProject(id) {
  window.location.href = `editor.html?id=${id}`;
}

// ── 유틸 ──────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function getInitials(nickname) {
  if (!nickname) return "?";
  const hasKorean = /[가-힣]/.test(nickname);
  return nickname.slice(0, hasKorean ? 1 : 2).toUpperCase();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
