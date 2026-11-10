const ATELIER_IMAGE = 'assets/home/atelier-hands.jpg';
const SIGNATURE_IMAGE = 'assets/home/dark-chocolate-ganache.webp';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const compactLayout = matchMedia('(max-width: 900px)');

const clamp = value => Math.min(1, Math.max(0, value));
const mix = (a, b, t) => a + (b - a) * t;

function ease(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function windowed(progress, inStart, inEnd, outStart, outEnd) {
  const enter = ease((progress - inStart) / Math.max(0.0001, inEnd - inStart));
  const exit = 1 - ease((progress - outStart) / Math.max(0.0001, outEnd - outStart));
  return clamp(Math.min(enter, exit));
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (typeof text === 'string') element.textContent = text;
  return element;
}

function createParticles(host, count) {
  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement('span');
    particle.className = 'maison-cinema__particle';
    particle.style.setProperty('--x', `${Math.random() * 100}%`);
    particle.style.setProperty('--y', `${18 + Math.random() * 54}%`);
    particle.style.setProperty('--size', `${2 + Math.random() * 5}px`);
    particle.style.setProperty('--delay', `${Math.random() * 3.5}s`);
    particle.style.setProperty('--duration', `${5 + Math.random() * 4}s`);
    host.append(particle);
  }
}

function buildDoor(image, side) {
  const door = createElement('div', `maison-cinema__door maison-cinema__door--${side}`);
  door.setAttribute('aria-hidden', 'true');

  const copy = image.cloneNode(false);
  copy.alt = '';
  copy.removeAttribute('fetchpriority');
  copy.decoding = 'async';
  copy.draggable = false;

  door.append(copy);
  return door;
}

function buildAtelierScene() {
  const scene = createElement('section', 'maison-cinema__scene maison-cinema__scene--atelier');
  scene.setAttribute('aria-hidden', 'true');

  const image = createElement('img', 'maison-cinema__atelier-image');
  image.src = ATELIER_IMAGE;
  image.alt = '';

  const haze = createElement('span', 'maison-cinema__atelier-haze');
  const glow = createElement('span', 'maison-cinema__atelier-glow');
  const ring = createElement('span', 'maison-cinema__alchemy-ring');
  const crossA = createElement('span', 'maison-cinema__alchemy-line maison-cinema__alchemy-line--a');
  const crossB = createElement('span', 'maison-cinema__alchemy-line maison-cinema__alchemy-line--b');

  const kicker = createElement('span', 'maison-cinema__atelier-kicker', 'NOTE PHILOSOPHIQUE · 01');

  const words = createElement('div', 'maison-cinema__word-group');
  const precision = createElement('span', 'maison-cinema__word maison-cinema__word--precision', 'ĐỘ CHÍNH XÁC');
  const soul = createElement('span', 'maison-cinema__word maison-cinema__word--soul', 'TÂM HỒN');
  words.append(precision, soul);

  const quote = createElement(
    'p',
    'maison-cinema__philosophy-copy',
    'Chúng tôi đo lường bằng độ chính xác, nhưng chúng tôi nướng bằng tâm hồn.'
  );

  const particles = createElement('div', 'maison-cinema__particles');
  createParticles(particles, 18);

  scene.append(image, haze, glow, ring, crossA, crossB, kicker, words, quote, particles);
  return scene;
}

function buildSignatureScene() {
  const scene = createElement('section', 'maison-cinema__scene maison-cinema__scene--signature');
  scene.setAttribute('aria-hidden', 'true');

  const spotlight = createElement('span', 'maison-cinema__signature-spotlight');
  const orbit = createElement('span', 'maison-cinema__signature-orbit');
  const meta = createElement('span', 'maison-cinema__signature-meta', '01 / 04 · L’ORIGINE — CHOCOLAT');

  const cakeWrap = createElement('div', 'maison-cinema__signature-cake-wrap');
  const cake = createElement('img', 'maison-cinema__signature-cake');
  cake.src = SIGNATURE_IMAGE;
  cake.alt = 'Dark Chocolate Ganache Tart';
  cakeWrap.append(cake);

  const caption = createElement('div', 'maison-cinema__signature-caption');
  const captionKicker = createElement('span', 'maison-cinema__signature-kicker', 'SIGNATURE PATISSERIE');
  const title = createElement('h3', 'maison-cinema__signature-title', 'Dark Chocolate Ganache Tart');
  const description = createElement(
    'p',
    'maison-cinema__signature-description',
    'Lớp ganache sẫm mịn như nhung, hoàn thiện bằng tinh thần pâtisserie cổ điển và cảm giác thưởng thức đậm chiều sâu.'
  );

  caption.append(captionKicker, title, description);
  scene.append(spotlight, orbit, meta, cakeWrap, caption);

  return scene;
}

export function initMaisonReveal() {
  const hero = document.querySelector('.home-hero');
  const heroImage = hero?.querySelector('.home-hero__photo img');
  const bestsellers = document.querySelector('#bestsellers');
  const collection = bestsellers?.querySelector('.maison-v4');
  const oldBreather = document.querySelector('.home-breather');

  if (!hero || !heroImage || !bestsellers || !collection || hero.closest('.maison-cinema')) {
    return;
  }

  oldBreather?.remove();

  const shell = createElement('section', 'maison-cinema');
  const pin = createElement('div', 'maison-cinema__pin');
  const stage = createElement('div', 'maison-cinema__stage');
  const seam = createElement('span', 'maison-cinema__seam');

  const leftDoor = buildDoor(heroImage, 'left');
  const rightDoor = buildDoor(heroImage, 'right');
  const atelier = buildAtelierScene();
  const signature = buildSignatureScene();

  hero.before(shell);
  shell.append(pin, bestsellers);
  pin.append(stage);
  stage.append(atelier, signature, leftDoor, rightDoor, seam, hero);

  shell.classList.add('maison-cinema--ready');
  bestsellers.classList.add('maison-cinema__collection-host');

  let scheduled = false;

  const render = () => {
    scheduled = false;

    const rect = pin.getBoundingClientRect();
    const distance = Math.max(1, pin.offsetHeight - window.innerHeight);
    const progress = clamp(-rect.top / distance);

    if (compactLayout.matches || reducedMotion.matches) {
      shell.style.setProperty('--mc-progress', progress.toFixed(4));
      shell.style.setProperty('--mc-left', '0%');
      shell.style.setProperty('--mc-right', '0%');
      shell.style.setProperty('--mc-copy', '1');
      shell.style.setProperty('--mc-seam', '0');
      shell.style.setProperty('--mc-atelier', '0');
      shell.style.setProperty('--mc-word-left', '0rem');
      shell.style.setProperty('--mc-word-right', '0rem');
      shell.style.setProperty('--mc-word-gap', '2rem');
      shell.style.setProperty('--mc-alchemy', '0');
      shell.style.setProperty('--mc-quote', '0');
      shell.style.setProperty('--mc-signature', '0');
      shell.style.setProperty('--mc-signature-lift', '1.75rem');
      shell.style.setProperty('--mc-signature-spin', '10deg');
      shell.style.setProperty('--mc-stage-dark', '0');
      hero.querySelector('.home-hero__text')?.removeAttribute('inert');
      return;
    }

    const heroOpen = ease((progress - 0.05) / 0.22);
    const heroCopy = 1 - ease((progress - 0.06) / 0.14);
    const seamOpacity = windowed(progress, 0.08, 0.18, 0.22, 0.34);

    const atelierOpacity = windowed(progress, 0.18, 0.32, 0.60, 0.76);
    const converge = ease((progress - 0.44) / 0.18);
    const alchemyOpacity = windowed(progress, 0.46, 0.58, 0.68, 0.82);
    const quoteOpacity = windowed(progress, 0.52, 0.62, 0.70, 0.84);

    const signatureOpacity = ease((progress - 0.72) / 0.18);
    const stageDark = ease((progress - 0.70) / 0.20);

    shell.style.setProperty('--mc-progress', progress.toFixed(4));
    shell.style.setProperty('--mc-left', `${(-heroOpen * 52).toFixed(3)}%`);
    shell.style.setProperty('--mc-right', `${(heroOpen * 52).toFixed(3)}%`);
    shell.style.setProperty('--mc-copy', heroCopy.toFixed(3));
    shell.style.setProperty('--mc-seam', seamOpacity.toFixed(3));

    shell.style.setProperty('--mc-atelier', atelierOpacity.toFixed(3));
    shell.style.setProperty('--mc-word-left', `${mix(-10, -1.35, converge).toFixed(3)}rem`);
    shell.style.setProperty('--mc-word-right', `${mix(10, 1.35, converge).toFixed(3)}rem`);
    shell.style.setProperty('--mc-word-gap', `${mix(8, 1.5, converge).toFixed(3)}rem`);

    shell.style.setProperty('--mc-alchemy', alchemyOpacity.toFixed(3));
    shell.style.setProperty('--mc-quote', quoteOpacity.toFixed(3));

    shell.style.setProperty('--mc-signature', signatureOpacity.toFixed(3));
    shell.style.setProperty('--mc-signature-lift', `${mix(2.5, 0, signatureOpacity).toFixed(3)}rem`);
    shell.style.setProperty('--mc-signature-spin', `${mix(10, 0, signatureOpacity).toFixed(3)}deg`);
    shell.style.setProperty('--mc-stage-dark', stageDark.toFixed(3));

    const copy = hero.querySelector('.home-hero__text');
    if (copy) copy.inert = heroCopy < 0.08;
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  };

  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule, {passive: true});
  addEventListener('pageshow', schedule);
  compactLayout.addEventListener?.('change', schedule);
  reducedMotion.addEventListener?.('change', schedule);

  schedule();
}