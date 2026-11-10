import { trackEvent } from '../core/analytics.js';

function initAboutMotion() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches || !('IntersectionObserver' in window) || typeof Element.prototype.animate !== 'function') return;

  const active = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !entry.target.isConnected) continue;
      observer.unobserve(entry.target);
      if (reducedMotion.matches) continue;
      const { aboutReveal, delay, duration, distance } = entry.target.dataset;
      const offset = Number(distance) || (aboutReveal === 'up' ? 30 : 50);
      const transform = aboutReveal === 'left' ? `translateX(-${offset}px)`
        : aboutReveal === 'right' ? `translateX(${offset}px)` : `translateY(${offset}px)`;
      const animation = entry.target.animate(
        [{ opacity: 0, transform }, { opacity: 1, transform: 'translate(0)' }],
        { duration: Number(duration) || 300, delay: Number(delay) || 0, easing: 'ease-out', fill: 'backwards' }
      );
      active.add(animation);
      animation.onfinish = animation.oncancel = () => active.delete(animation);
    }
  }, { threshold: 0.12 });

  document.querySelectorAll('[data-about-reveal]').forEach(node => observer.observe(node));
  reducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    for (const animation of active) animation.cancel();
    active.clear();
  });
}

trackEvent('page_view', { page_title: 'Câu Chuyện Thương Hiệu' });
initAboutMotion();
