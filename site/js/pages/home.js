import {getAll as getProducts} from '../services/productService.js';
import {renderProductCards} from '../components/product-card.js';
import {mountMaisonJourney, SIGNATURE_NAMES} from './home-premium.js';
import {el} from '../core/dom.js';

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



export function initHome() {
  reveal();

  void loadCollection();

}

initHome();