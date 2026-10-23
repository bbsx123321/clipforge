/* ── 多线路下载：依次探测镜像，第一个可用的即用；全部失败回退直连 ── */
const RELEASE_BASE = 'https://github.com/bbsx123321/clipforge/releases/download/v1.1.0/';
const FILES = {
  setup: 'ClipForge.Setup.1.1.0.exe',
  portable: 'ClipForge.1.1.0.exe'
};
/* 线路标签与按钮状态文案按页面语言（<html lang>）自适应 */
const IS_EN = document.documentElement.lang === 'en';
const MIRRORS = IS_EN
  ? [
      { label: 'Route 1', prefix: 'https://ghfast.top/' },
      { label: 'Route 2', prefix: 'https://gh-proxy.com/' },
      { label: 'Route 3', prefix: 'https://ghproxy.net/' },
      { label: 'Route 4', prefix: 'https://github.moeyy.xyz/' },
      { label: 'Direct', prefix: '' }
    ]
  : [
      { label: '线路1', prefix: 'https://ghfast.top/' },
      { label: '线路2', prefix: 'https://gh-proxy.com/' },
      { label: '线路3', prefix: 'https://ghproxy.net/' },
      { label: '线路4', prefix: 'https://github.moeyy.xyz/' },
      { label: '直连', prefix: '' }
    ];
const TEXT = IS_EN
  ? {
      probing: (label) => 'Selecting download route (' + label + ')…',
      chosen: (label) => 'Route selected: ' + label + ' — starting download…',
      allFailed: 'Route probing failed, trying direct…'
    }
  : {
      probing: (label) => '正在选择下载线路（' + label + '）…',
      chosen: (label) => '已选择 ' + label + '，开始下载…',
      allFailed: '线路探测失败，尝试直连…'
    };

/* 探测一条线路（HEAD + no-cors，超时返回 null） */
function probeLine(url, timeoutMs) {
  return new Promise((resolve) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => { ctrl.abort(); resolve(null); }, timeoutMs);
    fetch(url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal })
      .then(() => { clearTimeout(timer); resolve(url); })
      .catch(() => { clearTimeout(timer); resolve(null); });
  });
}

/* 智能下载：顺序探测 → 首个可用线路触发下载 → 全败回退直连 */
async function smartDownload(kind, btn) {
  const file = FILES[kind];
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.style.opacity = '0.75';
  for (const m of MIRRORS) {
    btn.textContent = TEXT.probing(m.label);
    const url = await probeLine(m.prefix + RELEASE_BASE + file, 5000);
    if (url !== null) {
      btn.textContent = TEXT.chosen(m.label);
      const a = document.createElement('a');
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { btn.innerHTML = original; btn.disabled = false; btn.style.opacity = '1'; }, 2600);
      return;
    }
  }
  btn.textContent = TEXT.allFailed;
  window.location.href = RELEASE_BASE + file;
  setTimeout(() => { btn.innerHTML = original; btn.disabled = false; btn.style.opacity = '1'; }, 2600);
}

/* 下载区手动线路（安装版）：自动选择失败时的备用入口 */
(function renderMirrorLinks() {
  const holder = document.getElementById('mirrorLinks');
  holder.innerHTML = '';
  MIRRORS.forEach((m, i) => {
    if (i > 0) { holder.appendChild(document.createTextNode(' · ')); }
    const a = document.createElement('a');
    a.href = m.prefix + RELEASE_BASE + FILES.setup;
    a.textContent = m.label;
    a.target = '_blank';
    a.rel = 'noopener';
    holder.appendChild(a);
  });
})();
