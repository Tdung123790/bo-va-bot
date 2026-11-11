import { getAll } from '../services/productService.js';
import { renderProductCards } from '../components/product-card.js';
import { el } from '../core/dom.js';
import { trackEvent } from '../core/analytics.js';
import { searchProducts } from '../services/searchService.js';

const categoryLabels = {
  All: 'Tất Cả',
  Pastries: 'Bánh Ngọt & Bánh Âu',
  Cakes: 'Bánh Kem GATO',
  Cookies: 'Bánh Quy Thủ Công',
  Breads: 'Bánh Mì',
};

// Existing footer links use Wix category codes; the local CMS export uses Vietnamese values.
const legacyCategories = {
  Pastries: 'Bánh Ngọt & Bánh Âu',
  Cakes: 'Bánh Kem GATO',
  Cookies: 'Bánh Quy Thủ Công',
  Breads: 'Bánh Mì Ngũ Cốc Men Tự Nhiên',
};

const state = { products: [], category: 'All', search: '', sort: 'default', searchIds: null };
let searchTimer;
let searchGeneration = 0;
let initialCatalogRendered = false;
let cardObserver;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const activeReveals = new Set();

reducedMotion.addEventListener('change', event => {
  if (!event.matches) return;
  cardObserver?.disconnect();
  for (const animation of activeReveals) animation.cancel();
  activeReveals.clear();
});

function revealInitialCards(grid) {
  if (reducedMotion.matches || !('IntersectionObserver' in window) || typeof Element.prototype.animate !== 'function') return;
  cardObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting && entry.target.isConnected)
      .sort((a, b) => Number(a.target.dataset.revealIndex) - Number(b.target.dataset.revealIndex));
    visible.forEach((entry, index) => {
      cardObserver.unobserve(entry.target);
      if (reducedMotion.matches) return;
      const animation = entry.target.animate(
        [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 300, delay: Math.min(index, 3) * 50, easing: 'ease-out', fill: 'backwards' }
      );
      activeReveals.add(animation);
      animation.onfinish = animation.oncancel = () => activeReveals.delete(animation);
    });
  }, { threshold: 0.05 });
  grid.querySelectorAll('.product-card--menu').forEach((card, index) => {
    card.dataset.revealIndex = index;
    cardObserver.observe(card);
  });
}

function categoryValue(value) {
  const category = value?.trim();
  return (legacyCategories[category] || category || legacyCategories.Pastries).trim();
}

function syncFromUrl() {
  const params = new URLSearchParams(location.search);
  state.category = params.get('category') ? categoryValue(params.get('category')) : 'All';
  state.search = params.get('q') || '';
  state.sort = ['default', 'best-seller', 'price-asc', 'price-desc'].includes(params.get('sort'))
    ? params.get('sort')
    : 'default';
}

function syncToUrl() {
  const params = new URLSearchParams(location.search);
  for (const key of ['category', 'cakeGroup', 'q', 'sort', 'page']) params.delete(key);
  if (state.category !== 'All') params.set('category', state.category);
  if (state.search) params.set('q', state.search);
  if (state.sort !== 'default') params.set('sort', state.sort);
  history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
}

function renderFilters() {
  const categories = ['All', ...new Set(state.products.map(product => categoryValue(product.category || product.categoryId)))];
  const region = document.querySelector('#category-filters');
  region.replaceChildren(...categories.map(category => {
    const button = el('button', {
      type: 'button',
      className: 'menu-chip',
      text: categoryLabels[category] || category,
      'aria-pressed': String(category === state.category),
    });
    button.addEventListener('click', () => {
      state.category = category;
      renderFilters();
      render();
      syncToUrl();
    });
    return button;
  }));
}

function filtered() {
  const search = state.search.trim().toLocaleLowerCase('vi');
  const rows = state.products.filter(product => {
    const categoryMatches=state.category==='All'||categoryValue(product.category||product.categoryId)===state.category;
    const searchMatches=!search||(state.searchIds
      ? state.searchIds.has(String(product.id))&&Number(product.stockQuantity)>0&&Number(product.price)>0&&!product.isCustomizable
      : `${product.name||''} ${product.description||''}`.toLocaleLowerCase('vi').includes(search));
    return categoryMatches&&searchMatches;
  });
  if (state.sort === 'price-asc') rows.sort((a, b) => (a.price || 0) - (b.price || 0));
  if (state.sort === 'price-desc') rows.sort((a, b) => (b.price || 0) - (a.price || 0));
  if (state.sort === 'best-seller') rows.sort((a, b) => Number(b.isBestSeller) - Number(a.isBestSeller));
  if (state.sort === 'default' && state.searchIds) rows.sort((a,b)=>state.searchIds.get(String(a.id))-state.searchIds.get(String(b.id)));
  return rows;
}

function scheduleSearch(){
  const generation=++searchGeneration;
  clearTimeout(searchTimer);
  state.searchIds=null;
  const status=document.querySelector('#menu-search-status');
  const query=state.search.trim();
  if(query.length<3){status.textContent=query?'Nhập ít nhất 3 ký tự để tìm bằng mô hình.':'';render();return;}
  state.searchIds=new Map();
  status.textContent='Đang tìm bằng mô hình...';
  render();
  searchTimer=setTimeout(async()=>{
    try{
      const result=await searchProducts(query,{limit:24});
      if(generation!==searchGeneration)return;
      state.searchIds=new Map(result.results.map((row,index)=>[row.source_id,index]));
      status.textContent=`Tìm kiếm bằng mô hình: ${result.results.length} kết quả.`;
      render();
      trackEvent('search',{search_term:query});
    }catch(error){
      if(generation!==searchGeneration)return;
      state.searchIds=null;
      status.textContent='';
      render();
      console.error(error);
    }
  },300);
}

function render() {
  const rows = filtered();
  cardObserver?.disconnect();
  for (const animation of activeReveals) animation.cancel();
  activeReveals.clear();
  const grid = document.querySelector('#menu-grid');
  renderProductCards(grid, rows, { menu: true });
  if (!initialCatalogRendered) {
    initialCatalogRendered = true;
    revealInitialCards(grid);
  }
  document.querySelector('#menu-empty').hidden = rows.length !== 0;
}

export async function initMenu() {
  syncFromUrl();
  const input = document.querySelector('#product-search');
  const sort = document.querySelector('#product-sort');
  input.value = state.search;
  sort.value = state.sort;

  try {
    const result = await getAll([], { limit: 100 });
    state.products = result.items;
    state.search=input.value;
    renderFilters();
    render();
    scheduleSearch();
    trackEvent('view_item_list', { item_list_name: 'Menu Page' });
  } catch (error) {
    document.querySelector('#menu-grid').replaceChildren(el('p', { text: 'Không thể tải thực đơn. Vui lòng thử lại sau.' }));
    console.error(error);
    return;
  }

  input.addEventListener('input', () => {
    state.search = input.value;
    scheduleSearch();
    syncToUrl();
  });
  sort.addEventListener('change', () => {
    state.sort = sort.value;
    render();
    syncToUrl();
  });
  document.querySelector('#clear-filters').addEventListener('click', () => {
    state.category = 'All';
    state.search = '';
    state.sort = 'default';
    input.value = '';
    sort.value = 'default';
    renderFilters();
    scheduleSearch();
    syncToUrl();
  });
  window.addEventListener('popstate', () => {
    syncFromUrl();
    input.value = state.search;
    sort.value = state.sort;
    renderFilters();
    scheduleSearch();
  });
}

initMenu();
