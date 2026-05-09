// ── project.js ──

// ── 임시 데이터 (API 연결 전 Mock) ──────────────────────────
const currentUser = { username: "KYJ", nickname: "김" };

let myProjects = [
  {
    id: 1,
    name: "Auth Service",
    owner: "Root",
    description: "사용자 인증 및 JWT 토큰 발급을 담당하는 MSA 인증 서비스",
  },
  {
    id: 2,
    name: "API Gateway",
    owner: "MH",
    description: "각 마이크로서비스로의 라우팅 및 로드밸런싱 처리 게이트웨이",
  },
  {
    id: 3,
    name: "Frontend UI",
    owner: "Ch",
    description: "CodeSync 웹 클라이언트 — React 기반 실시간 협업 에디터 UI",
  },
];

let invites = [
  { id: 101, projectName: "Data Pipeline", fromUser: "김경운" },
  { id: 102, projectName: "ML Model Server", fromUser: "원미혜" },
  { id: 103, projectName: "Tester", fromUser: "추송주" },
];

// ── 초기화 ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("nav-username").textContent = currentUser.username;
  document.getElementById("nav-avatar").textContent = getInitials(
    currentUser.nickname,
  );
  renderProjects();
  renderInvites();
});

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
        <div class="project-desc">${escHtml(p.description || "설명 없음")}</div>
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

// ── 초대목록 렌더링 ───────────────────────────────────────────
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
    <div class="invite-card" style="animation-delay:${i * 0.08}s" id="invite-${inv.id}">
      <div class="invite-project">${escHtml(inv.projectName)}</div>
      <div class="invite-from">from <span>@${escHtml(inv.fromUser)}</span></div>
      <div class="invite-actions">
        <button class="btn-accept"  onclick="respondInvite(${inv.id}, true)">수락</button>
        <button class="btn-decline" onclick="respondInvite(${inv.id}, false)">거절</button>
      </div>
    </div>
  `,
    )
    .join("");
}

// ── 초대 수락 / 거절 ──────────────────────────────────────────
async function respondInvite(inviteId, accept) {
  const inv = invites.find((i) => i.id === inviteId);
  if (!inv) return;

  try {
    // TODO: API 연결
    // await fetch(`http://YOUR_API_URL/api/invites/${inviteId}/respond`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ accept })
    // });

    // [DEV] Mock 처리
    if (accept) {
      myProjects.push({
        id: Date.now(),
        name: inv.projectName,
        owner: inv.fromUser,
        description: "",
      });
    }
    invites = invites.filter((i) => i.id !== inviteId);
    renderProjects();
    renderInvites();
  } catch (e) {
    console.error("[DEV] API 미연결:", e);
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
  const name = document.getElementById("proj-name").value.trim();
  const desc = document.getElementById("proj-desc").value.trim();
  const status = document.getElementById("modal-status");

  if (!name) {
    status.textContent = "프로젝트 명을 입력해주세요.";
    status.className = "modal-status error";
    return;
  }

  status.textContent = "생성 중...";
  status.className = "modal-status";

  try {
    // TODO: API + DB 연결
    // const res = await fetch('http://YOUR_API_URL/api/projects', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ name, description: desc, owner: currentUser.username })
    // });
    // const data = await res.json();

    // [DEV] Mock 처리
    myProjects.push({
      id: Date.now(),
      name,
      description: desc,
      owner: currentUser.username,
    });

    status.textContent = "✓ 프로젝트가 생성되었습니다!";
    status.className = "modal-status success";
    renderProjects();
    setTimeout(closeModal, 1000);
  } catch (e) {
    status.textContent = "[DEV] API 미연결 상태입니다.";
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
