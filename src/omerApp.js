import dayjs from 'dayjs';
import {cacheControl, httpRedirect} from './common';
import {basename, dirname} from 'path';
import {HDate, months, OmerEvent, HebrewCalendar, Locale} from '@hebcal/core';

const CACHE_CONTROL_30DAYS = cacheControl(30);
const CACHE_CONTROL_1_YEAR = cacheControl(365);

// eslint-disable-next-line require-jsdoc
export function omerApp(rpath, ctx) {
  if (rpath === '/omer/sitemap.txt') {
    const prefix = 'https://www.hebcal.com/omer';
    let body = '';
    const hyear = new HDate().getFullYear();
    for (let year = hyear - 1; year < hyear + 4; year++) {
      body += `${prefix}/${year}\n`;
      for (let day = 1; day <=49; day++) {
        body += `${prefix}/${year}/${day}\n`;
      }
    }
    ctx.lastModified = ctx.launchDate;
    ctx.set('Cache-Control', CACHE_CONTROL_1_YEAR);
    ctx.type = 'text/plain';
    ctx.body = body;
    return;
  }
  const yearStr = basename(dirname(rpath));
  if (yearStr === '') {
    return redirCurrentYear(ctx);
  } else if (yearStr === 'omer') {
    const hyear = parseInt(basename(rpath), 10);
    if (isNaN(hyear) || hyear < 3762 || hyear > 9999) {
      return redirCurrentYear(ctx);
    }
    const beginOmer = HDate.hebrew2abs(hyear, months.NISAN, 16);
    const items = Array(50);
    for (let omerDay = 1; omerDay <= 49; omerDay++) {
      const abs = beginOmer + omerDay - 1;
      const hd = new HDate(abs);
      const d = dayjs(hd.greg());
      const ev = new OmerEvent(hd, omerDay);
      const lines = ev.memo.split('\n');
      items[omerDay] = {omerDay, ev, hd, d, sefira: lines[0], he: lines[1]};
    }
    ctx.lastModified = ctx.launchDate;
    ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
    return ctx.render('omer-year', {
      hyear,
      items,
    });
  }
  const hyear = parseInt(yearStr, 10);
  if (isNaN(hyear) || hyear < 3762 || hyear > 9999) {
    return redirCurrentYear(ctx);
  }
  const omerDay = parseInt(basename(rpath), 10);
  if (isNaN(omerDay) || omerDay < 1 || omerDay > 49) {
    httpRedirect(ctx, `/omer/${hyear}/1`, 302);
    return;
  }
  const beginOmer = HDate.hebrew2abs(hyear, months.NISAN, 16);
  const hd = new HDate(beginOmer + omerDay - 1);
  const ev = new OmerEvent(hd, omerDay);
  const lines = ev.memo.split('\n');
  const holidays = HebrewCalendar.getHolidaysOnDate(hd, false) || [];
  const prev = omerDay === 1 ? 49 : omerDay - 1;
  const next = omerDay === 49 ? 1 : omerDay + 1;
  ctx.lastModified = ctx.launchDate;
  ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  return ctx.render('omer', {
    ev,
    d: dayjs(hd.greg()),
    hd,
    hyear,
    omerDay,
    prev,
    prevNth: Locale.ordinal(prev, 'en'),
    next,
    nextNth: Locale.ordinal(next, 'en'),
    sefEnglish: lines[0],
    sefHebrew: lines[1],
    sefTranslit: lines[2],
    holidays,
  });
}

// eslint-disable-next-line require-jsdoc
function redirCurrentYear(ctx) {
  const hd = new HDate();
  httpRedirect(ctx, `/omer/${hd.getFullYear()}`, 302);
  return;
}