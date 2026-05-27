// ── theme.js — CodeSync 테마 관리 ──
// 모든 페이지에서 공통으로 로드됩니다.

(function () {
  // 페이지 로드 즉시 테마 적용 (FOUC 방지)
  // 이 즉시실행함수는 파일 로드 시점에 바로 실행됩니다.
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light");
  }
})();

/**
 * 테마를 토글하고 localStorage에 저장합니다.
 */
function toggleTheme() {
  const isLight = document.body.classList.toggle("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
}
