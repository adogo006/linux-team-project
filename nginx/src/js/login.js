// ── login.js ──
// ── 로그인 요청 ───────────────────────────────────────────────
async function request_login(id, password) {
  const res = await fetch(`/api/request_login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, password }),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "INVALID_CREDENTIALS");
  }

  return data; // { access_token, token_type, nickname, ... }
}

// ── 핸들러 ────────────────────────────────────────────────────
async function handleLogin() {
  const id = document.getElementById("login-id").value.trim();
  const pw = document.getElementById("login-pw").value;
  const status = document.getElementById("login-status");

  if (!id || !pw) {
    status.textContent = "아이디와 비밀번호를 제대로 입력해주세요.";
    status.className = "status error";
    return;
  }

  status.textContent = "로그인 중...";
  status.className = "status";

  try {
    const data = await request_login(id, pw);

    if (data && data.success) {
      sessionStorage.setItem("access_token", data.access_token);
      sessionStorage.setItem("nickname", data.nickname); // 파싱 없이 바로 사용
      sessionStorage.setItem("token_type", data.token_type);

      status.textContent = "✓ 로그인 성공";
      status.className = "status success";

      window.location.href = "project.html";
    }else{
      status.textContent = "로그인 실패";
      status.className = "status error";
    }

  } catch (e) {
    const msg = e.message;
      console.error("Login error:", msg);
      status.textContent =
        "서버와 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
    status.className = "status error";
  }
}

function goRegister() {
  window.location.href = "register.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const token = sessionStorage.getItem("access_token");
  if (token) {
    window.location.href = "project.html";
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
