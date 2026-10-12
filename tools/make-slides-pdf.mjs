#!/usr/bin/env node
/**
 * tools/make-slides-pdf.mjs — docs/slides/day2.html 을 PDF 로 (장마다 1920x1080 한 페이지)
 *   설치된 Chrome 을 playwright-core 로 띄워, 웹 폰트와 Mermaid 그림이 다 그려진 뒤(body[data-ready]) 인쇄한다
 *   (chrome --print-to-pdf 만으로는 그림이 덜 그려진 채 찍혀서 이렇게 한다)
 *   사용:  pnpm slides:pdf   →  docs/slides/day2.pdf   (먼저 pnpm slides 로 html 을 최신으로)
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const html = path.resolve("docs/slides/day2.html");
const pdf = path.resolve("docs/slides/day2.pdf");

let browser;
try { browser = await chromium.launch({ channel: "chrome" }); }                 // 내 PC 의 Google Chrome
catch { console.error("Google Chrome 을 찾지 못했습니다. 설치 후 다시 실행하세요."); process.exit(1); }

const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`file://${html}`, { waitUntil: "networkidle" });
await page.waitForSelector("body[data-ready='1']", { timeout: 60_000 });        // Mermaid 렌더 끝
await page.evaluate(() => document.fonts.ready);                                 // 웹 폰트 적용 끝
await page.emulateMedia({ media: "print" });                                     // @media print 규칙(장마다 한 페이지) 적용
await page.pdf({ path: pdf, printBackground: true, preferCSSPageSize: true });   // 크기는 html 의 @page 가 정한다
await browser.close();

const n = (fs.readFileSync(pdf, "latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
console.log(`[PDF] docs/slides/day2.pdf — ${n}장, ${Math.round(fs.statSync(pdf).size / 1024)} KB`);
