import {includePartials} from './partials.js';
import {initHeader} from '../components/header.js';
import {initAnalytics} from './analytics.js';
import {initScroll} from './scroll.js';
import {store} from './store.js';
import {initCartDrawer} from '../components/cart-drawer.js';
export async function bootstrap(){await includePartials();initHeader();await initCartDrawer();initScroll();initAnalytics().catch(console.error);window.addEventListener('bobot:auth-change',event=>store.set('user',event.detail?.user??null));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>bootstrap().catch(console.error));else bootstrap().catch(console.error);
