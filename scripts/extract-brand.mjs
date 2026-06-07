// Extrae el branding de la web corporativa: colores, fuentes, logo. Screenshot a archivo.
import { chromium } from 'playwright';
const SITE = process.env.SITE || 'https://www.bbtigroup.com.pe/';
const OUT = process.env.OUT || 'C:/ClaudecodeProjects/BBTI/bbti-erp/scripts/brand';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(SITE, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => console.log('goto warn:', e.message));
await page.waitForTimeout(2000);

// Screenshots
await page.screenshot({ path: `${OUT}-top.png` });
await page.screenshot({ path: `${OUT}-full.png`, fullPage: true }).catch(() => {});

const data = await page.evaluate(() => {
  const rgbToHex = (rgb) => {
    const m = rgb.match(/\d+/g);
    if (!m) return null;
    const [r, g, b, a] = m.map(Number);
    if (a === 0) return null; // transparente
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  const tally = (arr) => {
    const c = {};
    for (const v of arr) if (v) c[v] = (c[v] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12);
  };
  const els = Array.from(document.querySelectorAll('*')).slice(0, 4000);
  const bgs = [], texts = [], fonts = new Set();
  for (const el of els) {
    const s = getComputedStyle(el);
    const bg = rgbToHex(s.backgroundColor);
    if (bg) bgs.push(bg);
    const col = rgbToHex(s.color);
    if (col) texts.push(col);
    if (s.fontFamily) fonts.add(s.fontFamily.split(',')[0].replace(/["']/g, '').trim());
  }
  // logo: imgs con 'logo' en src/alt, o el primer img del header
  const imgs = Array.from(document.querySelectorAll('img'));
  const logo = imgs.find((i) => /logo/i.test(i.src) || /logo/i.test(i.alt || '')) || imgs[0];
  // colores de botones/links/headers
  const sample = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const s = getComputedStyle(e);
    return { bg: rgbToHex(s.backgroundColor), color: rgbToHex(s.color), font: s.fontFamily.split(',')[0].replace(/["']/g, '') };
  };
  return {
    title: document.title,
    topBackgrounds: tally(bgs),
    topTextColors: tally(texts),
    fonts: Array.from(fonts).slice(0, 10),
    logo: logo ? { src: logo.src, alt: logo.alt, w: logo.naturalWidth, h: logo.naturalHeight } : null,
    header: sample('header'),
    button: sample('button, .btn, a.button, [class*="btn"]'),
    h1: sample('h1'),
    bodyBg: rgbToHex(getComputedStyle(document.body).backgroundColor),
  };
});

console.log(JSON.stringify(data, null, 2));
await browser.close();
process.exit(0);
