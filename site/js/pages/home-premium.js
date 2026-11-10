
import {formatVND} from '../core/format.js';
import {productHref} from '../components/product-card.js';

const SIGNATURES = [
  {name: 'Dark Chocolate Ganache Tart', image: 'assets/maison-v4/dark-chocolate-ganache.webp', background: '#30201c', ink: '#f8e9d6', caption: 'L’ORIGINE · CHOCOLAT'},
  {name: 'Salted Caramel Macadamia Tart', image: 'assets/maison-v4/salted-caramel-macadamia.webp', background: '#bb8e65', ink: '#30231d', caption: 'LA DOUCEUR · CARAMEL'},
  {name: 'Uji Matcha Mousse Cake', image: 'assets/maison-v4/uji-matcha-mousse.webp', background: '#52684f', ink: '#f6f1df', caption: 'L’ÉQUILIBRE · MATCHA'},
  {name: 'Strawberry Chiffon Shortcake', image: 'assets/maison-v4/strawberry-chiffon.webp', background: '#a24d61', ink: '#fff0e9', caption: 'L’ÉCLAT · FRAISE'}
];

export const SIGNATURE_NAMES = SIGNATURES.map(item => item.name);

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const compact = matchMedia('(max-width: 900px)');
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const ease = n => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
const ramp = (p, a, b) => ease((p - a) / (b - a));
const windowOpacity = (p, a, b, c, d) =>
  ramp(p, a, b) * (1 - ramp(p, c, d));

const mix = (a, b, t) => a + (b - a) * t;

const CINEMATIC_BEATS = [
  [0, 0],
  [.05, 0],
  [.09, .05],
  [.12, .05],
  [.195, .27],
  [.22, .27],
  [.255, .34],
  [.295, .34],
  [.365, .49],
  [.39, .49],
  [.465, .635],
  [.515, .635],
  [.565, .77],
  [.605, .77],
  [.645, .82],
  [.685, .82],
  [.725, .87],
  [.765, .87],
  [.81, .92],
  [.895, .92],
  [.95, .995],
  [1, .995]
];

function cinematicProgress(raw) {
  const value = clamp(raw);

  for (let i = 1; i < CINEMATIC_BEATS.length; i += 1) {
    const [end, endProgress] = CINEMATIC_BEATS[i];

    if (value <= end) {
      const [start, startProgress] = CINEMATIC_BEATS[i - 1];
      const t = ease((value - start) / (end - start));
      return mix(startProgress, endProgress, t);
    }
  }

  return 1;
}


function colorMix(a, b, t) {
  const x = a.match(/[0-9a-f]{2}/gi).map(v => parseInt(v, 16));
  const y = b.match(/[0-9a-f]{2}/gi).map(v => parseInt(v, 16));
  return `rgb(${x.map((n, i) =>
    Math.round(mix(n, y[i], clamp(t)))
  ).join(',')})`;
}

function node(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

function image(className, src, eager = false) {
  const element = node('img', className);
  element.src = src;
  element.alt = '';
  element.decoding = 'async';
  element.loading = eager ? 'eager' : 'lazy';
  element.draggable = false;
  return element;
}

function makeAtelier() {
  const scene = node('div', 'bobot-film__atelier');
  scene.setAttribute('aria-hidden', 'true');

  const plate = image(
    'bobot-film__plate',
    'assets/cinema/scene-02-background.png',
    true
  );
  const left = image(
    'bobot-film__arm bobot-film__arm--left',
    'assets/cinema/scene-02-left-hand.png',
    true
  );
  const right = image(
    'bobot-film__arm bobot-film__arm--right',
    'assets/cinema/scene-02-right-hand.png',
    true
  );
  const beam = node('div', 'bobot-film__beam');
  const dust = node('div', 'bobot-film__dust');

  for (let i = 0; i < 38; i += 1) {
    const particle = node('i', 'bobot-film__particle');
    particle.style.setProperty('--x', `${38 + (i * 37) % 25}%`);
    particle.style.setProperty('--y', `${28 + (i * 19) % 40}%`);
    particle.style.setProperty('--s', `${1 + i % 3}px`);
    particle.style.setProperty('--delay', `${-(i % 13) * .37}s`);
    dust.append(particle);
  }

  const precision = node('div', 'bobot-film__atelier-precision');
  precision.append(
    node('span', '', 'ĐỘ'),
    node('strong', '', 'CHÍNH XÁC')
  );

  const soul = node('div', 'bobot-film__atelier-soul', 'Tâm hồn');

  scene.append(plate, beam, left, right, dust, precision, soul);
  return scene;
}

function makeAlchemy() {
  const scene = node('div', 'bobot-film__alchemy');
  scene.setAttribute('aria-hidden', 'true');

  scene.append(image(
    'bobot-film__alchemy-bg',
    'assets/cinema/scene-03-atmosphere.webp',
    true
  ));

  const halo = node('div', 'bobot-film__alchemy-halo');
  const diagram = node('div', 'bobot-film__diagram');

  diagram.innerHTML = `<svg viewBox="0 0 1000 650" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <circle class="bobot-film__draw" cx="500" cy="295" r="178" pathLength="1"/>
    <circle class="bobot-film__draw bobot-film__draw--dim" cx="500" cy="295" r="142" pathLength="1"/>
    <path class="bobot-film__draw bobot-film__draw--axis" pathLength="1" d="M500 84V507M285 295H715"/>
    <path class="bobot-film__botanical" d="M500 215Q465 183 437 204Q460 230 500 240Q532 203 568 199Q547 238 507 249M502 226Q485 264 486 321Q487 376 510 395Q539 358 529 306Q525 263 502 226ZM501 251L511 378M491 275L520 289M490 307L524 321M492 340L521 350"/>
    <path class="bobot-film__draw bobot-film__draw--rule" pathLength="1" d="M120 375H880"/>
    <g class="bobot-film__nodes">
      <circle cx="500" cy="117" r="4"/>
      <circle cx="500" cy="473" r="4"/>
      <circle cx="322" cy="295" r="4"/>
      <circle cx="678" cy="295" r="4"/>
      <circle cx="120" cy="375" r="3"/>
      <circle cx="880" cy="375" r="3"/>
    </g>
  </svg>`;

  const notes = [
    ['bobot-film__note--tl', 'Beurre', 'chất béo thuần khiết'],
    ['bobot-film__note--tr', 'Farine', 'nền tảng tinh tuyển'],
    ['bobot-film__note--bl', 'Chocolat', 'chiều sâu hương vị'],
    ['bobot-film__note--br', 'Savoir-faire', 'kỹ nghệ thủ công']
  ];

  for (const [className, title, subtitle] of notes) {
    const item = node('div', `bobot-film__note ${className}`);
    item.append(
      node('strong', '', title),
      node('span', '', subtitle)
    );
    scene.append(item);
  }

  const heading = node('div', 'bobot-film__formula');
  heading.append(
    node('span', 'bobot-film__formula-precision', 'ĐỘ CHÍNH XÁC'),
    node('span', 'bobot-film__formula-amp', '&'),
    node('span', 'bobot-film__formula-soul', 'Tâm hồn')
  );

  const quote = node(
    'p',
    'bobot-film__quote',
    'Chúng tôi đo lường bằng độ chính xác, nhưng chúng tôi nướng bằng tâm hồn.'
  );

  scene.append(halo, diagram, heading, quote);
  return scene;
}

export function mountMaisonJourney(grid, products) {
  const hero = document.querySelector('.home-hero');
  const heroImage = hero?.querySelector('.home-hero__photo img');
  const section = grid?.closest('#bestsellers');

  if (!hero || !heroImage || !section || document.querySelector('.bobot-film')) {
    return;
  }

  const curated = SIGNATURES.map(signature => {
    const product = products.find(item =>
      String(item.name || item.itemName || '')
        .trim()
        .toLocaleLowerCase('vi') ===
      signature.name.toLocaleLowerCase('vi')
    );
    return product ? {product, signature} : null;
  }).filter(Boolean);

  if (curated.length !== SIGNATURES.length) {
    console.warn('Cinematic Home: thiếu sản phẩm signature trong catalog.');
    return;
  }

  const film = node('section', 'bobot-film');
  film.setAttribute(
    'aria-label',
    'Hành trình nghệ thuật làm bánh Bơ & Bột'
  );

  const stage = node('div', 'bobot-film__stage');
  const atelier = makeAtelier();
  const alchemy = makeAlchemy();
  const gallery = node('div', 'bobot-film__gallery');
  const spotlight = node('div', 'bobot-film__spotlight');
  const pedestal = node('div', 'bobot-film__pedestal');

  const cakes = curated.map(({product, signature}, index) => {
    const link = node('a', 'bobot-film__cake-link');
    link.href = Number(product.price) > 0
      ? productHref(product)
      : 'menu.html';

    link.setAttribute('aria-label', `Xem ${product.name}`);
    link.tabIndex = -1;
    link.inert = true;

    const photo = image(
      'bobot-film__cake',
      signature.image,
      index < 2
    );

    photo.addEventListener('error', () => {
      if (photo.dataset.fallback) return;
      photo.dataset.fallback = 'yes';

      if (product.image) {
        photo.src = product.image;
        link.classList.add('bobot-film__cake-link--fallback');
      } else {
        photo.remove();
      }
    });

    link.append(photo);
    gallery.append(link);
    return link;
  });

  gallery.append(spotlight, pedestal);

  const info = node('div', 'bobot-film__info');
  const caption = node('span', 'bobot-film__caption');
  const name = node('h2', 'bobot-film__name');
  const price = node('span', 'bobot-film__price');
  const detail = node(
    'a',
    'bobot-film__detail',
    'KHÁM PHÁ SẢN PHẨM ↗'
  );
  info.append(caption, name, price, detail);
  info.inert = true;

  const meta = node('div', 'bobot-film__meta');
  const counter = node('span', 'bobot-film__counter');
  const track = node('span', 'bobot-film__track');
  const fill = node('span', 'bobot-film__fill');
  track.append(fill);
  meta.append(
    counter,
    track,
    node('span', 'bobot-film__hint', 'CUỘN ĐỂ KHÁM PHÁ')
  );

  const end = node(
    'div',
    'bobot-film__end',
    'Khám phá trọn bộ sưu tập'
  );
  const skip = node(
    'a',
    'bobot-film__skip',
    'BỎ QUA TRẢI NGHIỆM ↗'
  );
  skip.href = '#best-seller-grid';

  const createDoor = side => {
    const door = node(
      'div',
      `bobot-film__door bobot-film__door--${side}`
    );
    door.setAttribute('aria-hidden', 'true');

    const photo = heroImage.cloneNode(false);
    photo.alt = '';
    photo.removeAttribute('fetchpriority');
    photo.removeAttribute('loading');
    photo.draggable = false;

    door.append(photo);
    return door;
  };

  const seam = node('div', 'bobot-film__seam');
  const leftDoor = createDoor('left');
  const rightDoor = createDoor('right');

  hero.before(film);
  film.append(stage);
  stage.append(
    atelier,
    alchemy,
    gallery,
    leftDoor,
    rightDoor,
    seam,
    hero,
    info,
    meta,
    end,
    skip
  );

  film.classList.add('bobot-film--ready');
  section.classList.add('bobot-film__collection-host');
  hero.querySelector('.home-hero__photo')
    ?.removeAttribute('data-parallax');

  const heroCopy = hero.querySelector('.home-hero__text');

  hero.querySelector('.maison-hero__discover')
    ?.addEventListener('click', () => {
      const filmTop =
        film.getBoundingClientRect().top + window.scrollY;

      const step = compact.matches || reduced.matches
        ? film.offsetHeight
        : (film.offsetHeight - window.innerHeight) * .25;

      window.scrollTo({
        top: filmTop + Math.max(step, window.innerHeight * .7),
        behavior: reduced.matches ? 'auto' : 'smooth'
      });
    });

  let selected = -1;
  let queued = false;

  const select = index => {
    if (index === selected) return;
    selected = index;

    const {product, signature} = curated[index];

    caption.textContent =
      `${String(index + 1).padStart(2, '0')} / 04 · ${signature.caption}`;

    name.textContent = product.name;
    price.textContent = Number(product.price) > 0
      ? formatVND(product.price)
      : 'Xem thực đơn';

    detail.href = Number(product.price) > 0
      ? productHref(product)
      : 'menu.html';

    counter.textContent =
      `${String(index + 1).padStart(2, '0')} / 04`;
  };

  function render() {
    queued = false;

    if (compact.matches || reduced.matches) {
      heroCopy?.removeAttribute('inert');
      info.inert = true;
      cakes.forEach(card => {
        card.inert = true;
        card.tabIndex = -1;
      });
      return;
    }

    const rect = film.getBoundingClientRect();
    if (rect.top > innerHeight || rect.bottom < -innerHeight) {
      return;
    }

    const p = clamp(
      -rect.top / Math.max(1, rect.height - innerHeight)
    );

    const open = ramp(p, .07, .25);
    const heroAlpha = 1 - ramp(p, .06, .18);
    const atelierAlpha = windowOpacity(p, .17, .27, .38, .51);
    const alchemyAlpha = windowOpacity(p, .39, .49, .60, .70);
    const galleryAlpha = ramp(p, .60, .69);
    const finale = ramp(p, .94, .995);

    const position =
      clamp((p - .70) / .22) * (curated.length - 1);

    const start = Math.min(
      Math.floor(position),
      curated.length - 1
    );
    const next = Math.min(
      start + 1,
      curated.length - 1
    );
    const t = position - start;
    const from = curated[start].signature;
    const to = curated[next].signature;

    const rgbToHex = rgb => `#${rgb.match(/\d+/g)
      .map(v => Number(v).toString(16).padStart(2, '0'))
      .join('')}`;

    const bg = colorMix(
      from.background,
      to.background,
      t
    );
    const ink = colorMix(from.ink, to.ink, t);
    const set = (key, value) => film.style.setProperty(key, value);

    const baseStage = colorMix(
      '#24160f',
      rgbToHex(bg),
      galleryAlpha
    );

    set(
      '--f-bg',
      colorMix(rgbToHex(baseStage), '#f8f3e9', finale)
    );
    set('--f-ink', ink);
    set('--f-hero', heroAlpha.toFixed(3));
    set('--f-left', `${(-open * 52).toFixed(2)}%`);
    set('--f-right', `${(open * 52).toFixed(2)}%`);
    set('--f-left-rotate', `${(-open * 8).toFixed(2)}deg`);
    set('--f-right-rotate', `${(open * 8).toFixed(2)}deg`);

    set(
      '--f-seam',
      windowOpacity(p, .09, .15, .24, .35).toFixed(3)
    );
    set('--f-atelier', atelierAlpha.toFixed(3));
    set(
      '--f-arm-left',
      `${mix(-3, 8, ramp(p, .20, .36)).toFixed(1)}px`
    );
    set(
      '--f-arm-right',
      `${mix(2, -6, ramp(p, .21, .38)).toFixed(1)}px`
    );
    set(
      '--f-words2',
      windowOpacity(p, .24, .32, .39, .49).toFixed(3)
    );
    set(
      '--f-dust',
      windowOpacity(p, .21, .28, .41, .49).toFixed(3)
    );

    set('--f-alchemy', alchemyAlpha.toFixed(3));
    set('--f-ring', ramp(p, .42, .52).toFixed(3));
    set('--f-cacao', ramp(p, .46, .55).toFixed(3));
    set('--f-notes1', ramp(p, .46, .51).toFixed(3));
    set('--f-notes2', ramp(p, .49, .54).toFixed(3));
    set('--f-notes3', ramp(p, .52, .57).toFixed(3));
    set('--f-formula', ramp(p, .52, .60).toFixed(3));
    set('--f-quote', ramp(p, .56, .63).toFixed(3));

    set(
      '--f-gallery',
      (galleryAlpha * (1 - finale)).toFixed(3)
    );
    set(
      '--f-meta',
      (ramp(p, .72, .77) * (1 - finale)).toFixed(3)
    );
    set('--f-end', finale.toFixed(3));

    fill.style.transform =
      `scaleX(${clamp((p - .77) / .15).toFixed(4)})`;

    if (heroCopy) {
      heroCopy.inert = heroAlpha < .06;
      heroCopy.style.pointerEvents =
        heroAlpha < .06 ? 'none' : 'auto';
    }

    select(clamp(
      Math.round(position),
      0,
      curated.length - 1
    ));

    const activeInfo =
      galleryAlpha > .95 && finale < .25;

    info.inert = !activeInfo;
    info.style.pointerEvents =
      activeInfo ? 'auto' : 'none';

    cakes.forEach((card, index) => {
      const delta = index - position;
      const depth = Math.abs(delta);
      const x = delta * Math.min(innerWidth * .47, 640);
      const opacity =
        clamp(1 - depth * 1.7) * galleryAlpha * (1 - finale);
      const z = -depth * 220;
      const angle = clamp(-delta * 15, -36, 36);
      const scale = Math.max(.7, 1 - depth * .15);

      card.style.transform =
        `translate3d(calc(-50% + ${x.toFixed(1)}px), ` +
        `-50%, ${z.toFixed(1)}px) ` +
        `rotateY(${angle.toFixed(2)}deg) ` +
        `scale(${scale.toFixed(3)})`;

      card.style.opacity = opacity.toFixed(3);

      const active = depth < .34 && activeInfo;
      card.inert = !active;
      card.tabIndex = active ? 0 : -1;
      card.style.pointerEvents =
        active ? 'auto' : 'none';
    });
  }

  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  };

  select(0);

  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule, {passive: true});
  addEventListener('pageshow', schedule);

  compact.addEventListener?.('change', schedule);
  reduced.addEventListener?.('change', schedule);

  render();
}
