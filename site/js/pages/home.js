import {getAll as getProducts} from '../services/productService.js';
import {getAll as getPromotions} from '../services/promotionService.js';
import {renderProductCards} from '../components/product-card.js';
import {mountMaisonJourney, SIGNATURE_NAMES} from './home-premium.js';
import {el} from '../core/dom.js';
import {toast} from '../core/toast.js';

function reveal() {
  const nodes = document.querySelectorAll('.reveal:not(.is-visible)');

  if (!('IntersectionObserver' in window)) {
    nodes.forEach(node => node.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, {threshold: .1});

  nodes.forEach(node => observer.observe(node));
}

function featuredProducts(items) {
  const available = items.filter(item =>
    (item.status || 'active') === 'active' &&
    item.price !== null &&
    item.price !== undefined &&
    Number(item.price) > 0 &&
    !item.isCustomizable
  );

  const score = item =>
    Number(Boolean(item.isBestSeller)) * 2 +
    Number(Boolean(item.isFeatured));

  return available
    .map((item, index) => ({item, index}))
    .sort((a, b) =>
      score(b.item) - score(a.item) || a.index - b.index
    )
    .slice(0, 8)
    .map(entry => entry.item);
}

async function loadCollection() {
  const grid = document.querySelector('#best-seller-grid');
  if (!grid) return;

  try {
    const page = await getProducts([], {limit: 1000});
    const all = (page.items || []).filter(item =>
  (item.status || 'active') === 'active' &&
  Number(item.price) > 0 &&
  !item.isCustomizable
);

const signatures = SIGNATURE_NAMES.map(name =>
  all.find(item =>
    String(item.name || item.itemName || '')
      .trim()
      .toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi')
  )
).filter(Boolean);

const chosen = [
  ...signatures,
  ...featuredProducts(all).filter(item =>
    !signatures.some(signature => signature.id === item.id)
  )
].slice(0, 8);

    if (!chosen.length) {
      grid.replaceChildren(
        el('p', {text: 'Chưa có sản phẩm đủ điều kiện trưng bày.'})
      );
      mountMaisonJourney(grid, []);
      return;
    }

    renderProductCards(grid, chosen, {home: true});
    mountMaisonJourney(grid, signatures);
    reveal();
  } catch (error) {
    console.error('Home collection:', error);
    grid.replaceChildren(
      el('p', {text: 'Không thể tải bộ sưu tập. Vui lòng thử lại.'})
    );
    mountMaisonJourney(grid, []);
  }
}

async function loadPromotions() {
  const grid = document.querySelector('#promotion-grid');
  if (!grid) return;

  try {
    const page = await getPromotions([], {limit: 1000});

    const active = (page.items || [])
      .filter(item => item.availability === 'active')
      .slice(0, 4);

    const cards = active.map(item => {
      const card = el('article', {className: 'promotion-tile'});

      const photo = el('img', {
        src: item.bannerImage ||
          'https://static.wixstatic.com/media/fb1c19_5a825b4c95524516b7b2290e8f2345ec~mv2.png?originWidth=768&originHeight=448',
        alt: item.title || 'Khuyến mãi',
        loading: 'lazy'
      });

      const caption = el('div', {
        className: 'promotion-tile__content'
      }, [
        el('span', {text: item.discountDetails || ''}),
        el('h3', {text: item.title || 'Ưu đãi'}),
        el('p', {text: item.description || ''}),
        el('a', {
          href: 'promotions.html',
          text: 'Khám Phá Thêm →'
        })
      ]);

      card.append(photo, caption);
      return card;
    });

    grid.replaceChildren(...cards);

    if (!cards.length) {
      grid.append(
        el('p', {text: 'Ưu đãi mới sẽ sớm được cập nhật.'})
      );
    }
  } catch (error) {
    console.error('Home promotions:', error);
    grid.replaceChildren(
      el('p', {text: 'Không thể tải ưu đãi.'})
    );
  }
}

function initNewsletter() {
  document.querySelector('#newsletter-form')?.addEventListener(
    'submit',
    event => {
      event.preventDefault();

      document.querySelector(
        '#newsletter-feedback'
      ).textContent = 'Biểu mẫu hiện chưa lưu địa chỉ email.';

      toast({
        title: 'Biểu mẫu đang ở chế độ mô phỏng',
        description: 'Email chưa được gửi hoặc lưu.'
      });

      event.target.reset();
    }
  );
}

export function initHome() {
  reveal();
  initNewsletter();
  void loadCollection();
  void loadPromotions();
}

initHome();