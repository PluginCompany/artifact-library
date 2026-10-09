/* Injected into every recorded page: a visible cursor with click ripples and a
   caption (lower third). Driven from record.py through window.__video. */
(() => {
  if (window.__video) return;
  const css = `
  #__vc{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:transform 0s;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))}
  #__vc svg{width:30px;height:30px}
  .__vr{position:fixed;z-index:2147483646;pointer-events:none;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:3px solid #3446C2;animation:__vr .55s ease-out forwards}
  @keyframes __vr{from{transform:scale(.3);opacity:.9}to{transform:scale(1.5);opacity:0}}
  #__cap{position:fixed;left:64px;bottom:64px;z-index:2147483645;pointer-events:none;max-width:1100px;padding:22px 30px 24px;border-radius:20px;background:rgba(16,19,23,.88);color:#fff;
    box-shadow:0 30px 80px -30px rgba(0,0,0,.6);backdrop-filter:blur(10px);opacity:0;transform:translateY(24px);transition:opacity .45s ease,transform .55s cubic-bezier(.2,.7,.2,1)}
  #__cap.on{opacity:1;transform:none}
  #__cap b{display:block;font:500 15px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#F0894B;margin-bottom:6px}
  #__cap span{display:block;font:700 34px/1.2 "Bricolage Grotesque","Segoe UI",system-ui,sans-serif;letter-spacing:-.01em}`;
  const style = document.createElement("style"); style.textContent = css;
  const cursor = document.createElement("div"); cursor.id = "__vc";
  cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2.5l15.5 9.2-6.6 1.6 3.9 7.1-2.9 1.6-3.9-7.2L5 19.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const cap = document.createElement("div"); cap.id = "__cap"; cap.innerHTML = "<b></b><span></span>";
  const mount = () => { if (!document.body) return requestAnimationFrame(mount); document.head.appendChild(style); document.body.append(cursor, cap); };
  mount();
  let x = -100, y = -100;
  addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; cursor.style.transform = `translate(${x - 4}px,${y - 2}px)`; }, true);
  addEventListener("mousedown", (e) => { const r = document.createElement("div"); r.className = "__vr"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px"; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  window.__video = {
    caption(kicker, text) { cap.querySelector("b").textContent = kicker || ""; cap.querySelector("span").textContent = text || ""; cap.classList.toggle("on", !!text); },
    hideCaption() { cap.classList.remove("on"); },
    place(px, py) { x = px; y = py; cursor.style.transform = `translate(${x - 4}px,${y - 2}px)`; },
    hideCursor() { cursor.style.opacity = "0"; },
    // Eased smooth scroll to y (or an element's top minus offset), resolving when done.
    scrollTo(target, ms = 900, offset = 120) {
      const el = typeof target === "string" ? document.querySelector(target) : null;
      const to = el ? el.getBoundingClientRect().top + scrollY - offset : target;
      const from = scrollY, d = to - from, t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      document.documentElement.style.scrollBehavior = "auto";
      return new Promise((done) => {
        const step = (now) => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, from + d * ease(t)); t < 1 ? requestAnimationFrame(step) : done(); };
        requestAnimationFrame(step);
      });
    },
  };
})();
