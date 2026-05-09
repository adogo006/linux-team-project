// ── login.js ──

const API_BASE = "http://YOUR_API_URL"; // TODO: API URL 확정되면 교체

// ── 로그인 요청 ───────────────────────────────────────────────
async function request_login(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();

  // 일치하지 않는 경우 API가 0 반환
  if (!res.ok || data === 0 || data.token === 0) {
    throw new Error(data.message || "INVALID_CREDENTIALS");
  }

  return data.token; // 토큰값 반환
}

// ── 핸들러 ────────────────────────────────────────────────────
async function handleLogin() {
  const id = document.getElementById("login-id").value.trim();
  const pw = document.getElementById("login-pw").value;
  const status = document.getElementById("login-status");

  // 입력 누락 체크
  if (!id || !pw) {
    status.textContent = "아이디와 비밀번호를 제대로 입력해주세요.";
    status.className = "status error";
    return;
  }

  status.textContent = "로그인 중...";
  status.className = "status";

  try {
    const token = await request_login(id, pw);

    // 토큰 sessionStorage 저장
    sessionStorage.setItem("token", token);

    status.textContent = "✓ 로그인 성공";
    status.className = "status success";

    // project.html로 이동
    window.location.href = "project.html";
  } catch (e) {
    if (e.message === "INVALID_CREDENTIALS") {
      status.textContent = "아이디 또는 비밀번호가 올바르지 않습니다.";
    } else {
      status.textContent =
        "서버와 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
    }
    status.className = "status error";
  }
}

function goRegister() {
  window.location.href = "Register.html";
}

// Enter 키 로그인
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
