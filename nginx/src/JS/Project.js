// ── project.js ──

const API_BASE = "http://YOUR_API_URL"; // TODO: API URL 확정되면 교체

// ── API 함수 ──────────────────────────────────────────────────

// 프로젝트 목록 조회
async function request_get_projects(token) {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("FETCH_FAILED");
  return await res.json(); // [{ id, name, owner }, ...]
}

// 프로젝트 생성
async function request_create_project(token, name) {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("CREATE_FAILED");
  return await res.json(); // { id, name, owner }
}

// 초대 목록 조회
async function request_get_invites(token) {
  const res = await fetch(`${API_BASE}/api/invites`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("FETCH_FAILED");
  return await res.json(); // [{ inviterId, projectId, projectName }, ...]
}

// 초대 수락/거절
async function request_respond_invite(token, inviterId, projectId, accept) {
  const res = await fetch(`${API_BASE}/api/invites/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ inviterId, projectId, accept }),
  });
  if (!res.ok) throw new Error("RESPOND_FAILED");
}

// ── 상태 ─────────────────────────────────────────────────────
let myProjects = [];
let invites = [];

// ── 초기화 ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const token = sessionStorage.getItem("access_token");

  // 토큰 없으면 로그인 페이지로
  /*if (!token) {
    window.location.href = "Login.html";
    return;
  }*/

  // JWT payload 디코딩해서 닉네임 표시
  // TODO: API 팀원과 payload 필드명 확인 (nickname or username)
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const nickname = payload.nickname || payload.username || "";
    document.getElementById("nav-username").textContent = nickname;
    document.getElementById("nav-avatar").textContent = getInitials(nickname);
  } catch (e) {
    document.getElementById("nav-username").textContent = "";
  }

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
    <div class="project-card" style="animation-delay:${i * 0.06}s" onclick="openProject(${p.id})">
      <div class="project-info">
        <div class="project-name">${escHtml(p.name)}</div>
      </div>
      <div class="project-meta">
        <div class="project-owner">
          <span class="owner-dot"></span>
          ${escHtml(p.owner)}
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
    <div class="invite-card" style="animation-delay:${i * 0.08}s" id="invite-${inv.projectId}">
      <div class="invite-project">${escHtml(inv.projectName)}</div>
      <div class="invite-from">from <span>@${escHtml(inv.inviterId)}</span></div>
      <div class="invite-actions">
        <button class="btn-accept"  onclick="respondInvite('${inv.inviterId}', ${inv.projectId}, true)">수락</button>
        <button class="btn-decline" onclick="respondInvite('${inv.inviterId}', ${inv.projectId}, false)">거절</button>
      </div>
    </div>
  `,
    )
    .join("");
}

// ── 초대 수락 / 거절 ──────────────────────────────────────────
async function respondInvite(inviterId, projectId, accept) {
  const token = sessionStorage.getItem("access_token");
  const card = document.getElementById(`invite-${projectId}`);

  // 버튼 비활성화 (중복 클릭 방지)
  if (card) card.querySelectorAll("button").forEach((b) => (b.disabled = true));

  try {
    await request_respond_invite(token, inviterId, projectId, accept);

    // 목록에서 제거
    invites = invites.filter((i) => i.projectId !== projectId);

    // 수락이면 프로젝트 목록 다시 로드
    if (accept) await loadProjects(token);

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
    const newProject = await request_create_project(token, name);
    myProjects.push(newProject);

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
  const hasKorean = /[가-힣]/.test(nickname);
  return nickname.slice(0, hasKorean ? 1 : 2).toUpperCase();
}

// ESC 키로 모달 닫기
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
