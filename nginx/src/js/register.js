// ── register.js ──
// ── 상태 ─────────────────────────────────────────────────────
const checked = { nickname: false, username: false };
const pwState = { valid: false, match: false };

// ── API 함수 ──────────────────────────────────────────────────

// 닉네임 중복 확인
async function request_register_nickname(nickname) {
  const res = await fetch(`/api/request_nickname_check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  const data = await res.json();
  return data.available; // { available: true/false }
}

// 아이디 중복 확인
async function request_register_id(username) {
  const res = await fetch(`/api/request_id_check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: username }), // 백엔드 필드명: user_id
  });
  const data = await res.json();
  return data.available; // { available: true/false }
}

// 회원가입
async function request_register(nickname, username, password) {
  const res = await fetch(`/api/request_register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nick_name: nickname, // 백엔드 필드명: nick_name
      id: username, // 백엔드 필드명: id
      password: password, // 백엔드 필드명: password
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "REGISTER_FAILED");
  }
}

// ── 유효성 검사 규칙 ──────────────────────────────────────────
const rules = {
  nickname: {
    regex: /^[가-힣a-zA-Z0-9]{2,12}$/,
    hint: "한글, 영문, 숫자 (2~12자)",
    err: "한글, 영문, 숫자만 사용하고 2~12자로 입력해주세요.",
  },
  username: {
    regex: /^[a-zA-Z0-9]{2,12}$/,
    hint: "영문, 숫자 (2~12자)",
    err: "영문, 숫자만 사용하고 2~12자로 입력해주세요.",
  },
};

// ── 실시간 유효성 확인 ────────────────────────────────────────
function validateField(field) {
  const input = document.getElementById(field);
  const hint = document.getElementById(field + "-hint");
  const btn = document.getElementById(field + "-btn");
  const value = input.value.trim();

  checked[field] = false;
  updateSubmitBtn();

  if (value.length === 0) {
    input.classList.remove("valid", "invalid");
    hint.textContent = rules[field].hint;
    hint.className = "hint info";
    btn.disabled = true;
    btn.className = "btn-check";
    return;
  }

  if (rules[field].regex.test(value)) {
    input.classList.add("valid");
    input.classList.remove("invalid");
    hint.textContent = "✓ 형식이 올바릅니다. 중복 확인을 해주세요.";
    hint.className = "hint ok";
    btn.disabled = false;
    btn.className = "btn-check active";
  } else {
    input.classList.add("invalid");
    input.classList.remove("valid");
    hint.textContent = rules[field].err;
    hint.className = "hint fail";
    btn.disabled = true;
    btn.className = "btn-check";
  }
}

// ── 중복 확인 ─────────────────────────────────────────────────
async function checkDuplicate(field) {
  const input = document.getElementById(field);
  const hint = document.getElementById(field + "-hint");
  const btn = document.getElementById(field + "-btn");
  const value = input.value.trim();

  hint.textContent = "확인 중...";
  hint.className = "hint info";
  btn.disabled = true;

  try {
    const available =
      field === "nickname"
        ? await request_register_nickname(value)
        : await request_register_id(value);

    if (available) {
      hint.textContent = "✓ 사용 가능합니다.";
      hint.className = "hint ok";
      input.classList.add("valid");
      input.classList.remove("invalid");
      checked[field] = true;
      btn.textContent = "✓ 확인됨";
      btn.className = "btn-check confirmed";
      btn.disabled = true;
    } else {
      hint.textContent = `✗ 이미 사용 중인 ${field === "nickname" ? "닉네임" : "아이디"}입니다.`;
      hint.className = "hint fail";
      input.classList.add("invalid");
      input.classList.remove("valid");
      checked[field] = false;
      btn.disabled = false;
      btn.className = "btn-check active";
    }
  } catch (e) {
    hint.textContent = "서버와 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
    hint.className = "hint fail";
    btn.disabled = false;
    btn.className = "btn-check active";
  }

  updateSubmitBtn();
}

// ── 비밀번호 확인 ─────────────────────────────────────────────
const PW_REGEX =
  /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$/;

function checkPassword() {
  const pw = document.getElementById("password").value;
  const pwHint = document.getElementById("pw-hint");
  const pwInput = document.getElementById("password");

  if (pw.length === 0) {
    pwHint.textContent = "영문, 숫자, 특수문자 포함 8자 이상";
    pwHint.className = "hint info";
    pwInput.classList.remove("valid", "invalid");
    pwState.valid = false;
  } else if (PW_REGEX.test(pw)) {
    pwHint.textContent = "✓ 안전한 비밀번호입니다.";
    pwHint.className = "hint ok";
    pwInput.classList.add("valid");
    pwInput.classList.remove("invalid");
    pwState.valid = true;
  } else {
    pwHint.textContent = "영문, 숫자, 특수문자를 모두 포함해주세요.";
    pwHint.className = "hint fail";
    pwInput.classList.add("invalid");
    pwInput.classList.remove("valid");
    pwState.valid = false;
  }

  checkConfirm();
}

function checkConfirm() {
  const pw = document.getElementById("password").value;
  const pw2 = document.getElementById("password-confirm").value;
  const matchHint = document.getElementById("pw-match-hint");
  const fill = document.getElementById("pw-match-fill");
  const pw2Input = document.getElementById("password-confirm");

  if (pw2.length === 0) {
    fill.style.width = "0%";
    matchHint.textContent = "";
    matchHint.className = "hint info";
    pw2Input.classList.remove("valid", "invalid");
    pwState.match = false;
  } else if (pw === pw2 && pwState.valid) {
    fill.style.width = "100%";
    fill.style.background = "#22c55e";
    matchHint.textContent = "✓ 비밀번호가 일치합니다.";
    matchHint.className = "hint ok";
    pw2Input.classList.add("valid");
    pw2Input.classList.remove("invalid");
    pwState.match = true;
  } else {
    const ratio =
      pw.length > 0 ? Math.min(pw2.length / pw.length, 0.9) * 100 : 0;
    fill.style.width = ratio + "%";
    fill.style.background = "#f87171";
    matchHint.textContent =
      pw === pw2
        ? "비밀번호 형식을 먼저 충족해주세요."
        : "✗ 비밀번호가 일치하지 않습니다.";
    matchHint.className = "hint fail";
    pw2Input.classList.add("invalid");
    pw2Input.classList.remove("valid");
    pwState.match = false;
  }

  updateSubmitBtn();
}

// ── 가입 버튼 활성화 ──────────────────────────────────────────
function updateSubmitBtn() {
  const ready =
    checked.nickname && checked.username && pwState.valid && pwState.match;
  document.getElementById("submit-btn").disabled = !ready;
}

// ── 회원가입 제출 ─────────────────────────────────────────────
async function handleRegister() {
  const status = document.getElementById("reg-status");
  const nickname = document.getElementById("nickname").value.trim();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  status.textContent = "처리 중...";
  status.className = "status";

  try {
    await request_register(nickname, username, password);

    status.textContent =
      "✓ 회원가입이 완료되었습니다! 로그인 페이지로 이동합니다.";
    status.className = "status success";
    setTimeout(goLogin, 1800);
  } catch (e) {
    status.textContent =
      e.message === "REGISTER_FAILED"
        ? "회원가입에 실패했습니다. 다시 시도해주세요."
        : e.message || "서버와 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
    status.className = "status error";
  }
}

function goLogin() {
  window.location.href = "login.html";
}
