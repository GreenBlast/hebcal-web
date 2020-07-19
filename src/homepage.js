/* eslint-disable require-jsdoc */
import {HDate, HebrewCalendar, months, Sedra, ParshaEvent, flags} from '@hebcal/core';
import {langTzDefaults, empty} from './common';
import dayjs from 'dayjs';

export async function homepage(ctx) {
  const q = ctx.request.query;
  const dt = (!empty(q.gy) && !empty(q.gm) && !empty(q.gd)) ?
    new Date(+q.gy, +q.gm - 1, +q.gd) : new Date();
  const hd = new HDate(dt);
  ctx.state.title = 'Jewish Calendar, Hebrew Date Converter, Holidays - hebcal.com';
  setDefaultYear(ctx, dt, hd);
  setDefautLangTz(ctx);
  const items = ctx.state.items = [];
  mastheadDates(items, dt, hd);
  mastheadHolidays(items, hd);
  mastheadParsha(items, hd);
  const [blub, longText] = getHolidayGreeting(hd);
  if (blub) {
    ctx.state.holidayBlurb = blub;
    ctx.state.holidayLongText = longText;
  } else {
    ctx.state.holidayBlurb = false;
  }
  return ctx.render('homepage');
}

function mastheadDates(items, dt, hd) {
  const d = dayjs(dt);
  const isoDt = d.format('YYYY-MM-DD');
  const fmtDt = d.format('ddd, D MMMM YYYY');
  items.push(
      `<time datetime="${isoDt}">${fmtDt}</time>`,
      hd.render(),
  );
}

function mastheadParsha(items, hd) {
  const sedra = new Sedra(hd.getFullYear(), false);
  if (sedra.isParsha(hd)) {
    const pe = new ParshaEvent(hd, sedra.get(hd));
    items.push(`<a href="${pe.url()}">${pe.render()}</a>`);
  }
}

function mastheadHolidays(items, hd) {
  const holidays = HebrewCalendar.getHolidaysOnDate(hd) || [];
  holidays
      .filter((ev) => ev.observedInDiaspora())
      .map((ev) => {
        const url = ev.url();
        const desc = ev.render();
        return url ? `<a href="${url}">${desc}</a>` : desc;
      }).forEach((str) => items.push(str));
}

/**
 * MaxMind geoIP lookup GeoLite2-Country.mmdb
 * @param {any} ctx
 */
function setDefautLangTz(ctx) {
  const ip = ctx.request.header['x-client-ip'] || ctx.request.ip;
  const geoip = ctx.lookup.get(ip);
  const cc = ctx.state.countryCode = geoip ? ctx.state.countryCode : 'US';
  if (langTzDefaults[cc]) {
    ctx.state.lang = langTzDefaults[cc][0];
    ctx.state.timezone = langTzDefaults[cc][1];
  } else {
    ctx.state.lang = langTzDefaults['US'][0];
    ctx.state.timezone = langTzDefaults['US'][1];
  }
}

function setDefaultYear(ctx, dt, hdate) {
  const hm = hdate.getMonth();
  const hy = hdate.getFullYear();
  // default to next year if it's past Tu B'Av or anytime in Elul
  const hyear = (hm == months.ELUL || (hm == months.AV && hdate.getDate() >= 16)) ? hy + 1 : hy;
  const gregYr1 = hyear - 3761;
  const gregYr2 = gregYr1 + 1;
  let gregRange = gregYr1 + '-' + gregYr2;
  let yearArgs = `&yt=H&year=${hyear}&month=x`;
  const gd = dt.getDate();
  const gm = dt.getMonth() + 1;
  const gy = dt.getFullYear();
  // for the first 7 months of the year, just show the current Gregorian year
  if (gm < 8 || gm == 12 && gd >= 10) {
    const gytmp = (gm == 12) ? gy + 1 : gy;
    yearArgs = `&yt=G&year=${gytmp}&month=x`;
    gregRange = gytmp;
  }
  Object.assign(ctx.state, {
    gregRange,
    yearArgs,
    gregYr1,
    gregYr2,
  });
}

const FORMAT_DOW_MONTH_DAY = 'ddd, D MMMM YYYY';

const chagSameach = {
  'Sukkot': true,
  'Pesach': true,
  'Shavuot': true,
  'Rosh Hashana': true,
  'Tu BiShvat': true,
  'Tu B\'Av': true,
  'Purim': true,
  'Shushan Purim': true,
  'Yom HaAtzma\'ut': true,
  'Lag B\'Omer': true,
  'Lag BaOmer': true,
  'Shmini Atzeret': true,
  'Simchat Torah': true,
};

function getHolidayGreeting(hd) {
  const mm = hd.getMonth();
  const dd = hd.getDate();
  const yy = hd.getFullYear();
  const purimMonth = HDate.isLeapYear(yy) ? months.ADAR_II : months.ADAR_I;
  const holidays = HebrewCalendar.getHolidaysOnDate(hd) || [];
  const roshChodesh = holidays.find((ev) => ev.getFlags() & flags.ROSH_CHODESH);

  if (roshChodesh) {
    const monthName = roshChodesh.getDesc().substring(13); // 'Rosh Chodesh '
    const url = roshChodesh.url();
    return ['Chodesh Tov',
      `We wish you a good new month of <a href="${url}">${monthName}</a>`];
  }
  if (mm == months.KISLEV && dd >= 24) {
    return ['Chag Urim Sameach',
      'We wish you a happy <a href="/holidays/chanukah">Chanukah</a>'];
  }
  if (mm == months.KISLEV && dd >= 1 && dd <= 13) {
    // for the first 2 weeks of Kislev, show Chanukah greeting
    const erevChanukah = dayjs(new HDate(24, months.KISLEV, yy).greg());
    const dow = erevChanukah.day();
    const strtime = erevChanukah.format(FORMAT_DOW_MONTH_DAY);
    const when = dow == 5 ? 'before sundown' : dow == 6 ? 'at nightfall' : 'at sundown';
    return ['Happy Chanukah',
      `Light the first <a href="https://www.hebcal.com/holidays/chanukah">Chanukah candle</a> ${when} on ${strtime}`];
  }
  if ((mm == months.TISHREI && dd >= 14 && dd <= 21) ||
      (mm == months.NISAN && dd >= 14 && dd <= 21)) {
    const holiday = mm == months.TISHREI ? 'Sukkot' : 'Pesach';
    return ['Moadim L\'Simcha', `We wish you a very happy ${holiday}`];
  }
  if (mm == months.ELUL || (mm == months.AV && dd >= 22)) {
    // for the last week of Av and entire month of Elul
    const nextYear = yy + 1;
    const erevRH = dayjs(new HDate(1, months.TISHREI, nextYear).prev().greg());
    const strtime = erevRH.format(FORMAT_DOW_MONTH_DAY);
    return ['Shana Tova', `We wish you a happy and healthy New Year.
<br>Rosh Hashana ${nextYear} begins at sundown on ${strtime}`];
  }
  if (mm == months.TISHREI && dd >= 3 && dd <= 9) {
    // between RH & YK
    const erevYK = dayjs(new HDate(9, months.TISHREI, yy).greg());
    const strtime = erevYK.format(FORMAT_DOW_MONTH_DAY);
    return [`G'mar Chatima Tova`, `We wish you a good inscription in the Book of Life.
<br><a href="https://www.hebcal.com/holidays/yom-kippur">Yom Kippur</a>
begins at sundown on ${strtime}`];
  }
  if (mm == purimMonth && dd <= 13) {
    // show Purim greeting 1.5 weeks before
    const erevPurim = dayjs(new HDate(13, purimMonth, yy).greg());
    const strtime = erevPurim.format(FORMAT_DOW_MONTH_DAY);
    return ['Chag Purim Sameach', `<a href="https://www.hebcal.com/holidays/purim">Purim</a>
begins at sundown on ${strtime}`];
  }
  if ((mm == purimMonth && dd >= 17) || (mm == months.NISAN && dd <= 14)) {
    // show Pesach greeting shortly after Purim and ~2 weeks before
    const erevPesach = dayjs(new HDate(14, months.NISAN, yy).greg());
    const strtime = erevPesach.format(FORMAT_DOW_MONTH_DAY);
    return ['Chag Kasher v\'Sameach', `We wish you a happy
<a href="https://www.hebcal.com/holidays/pesach">Passover</a>.
Pesach begins at sundown on ${strtime}`];
  }
  const fastDay = holidays.find((ev) => ev.getFlags() & (flags.MAJOR_FAST | flags.MINOR_FAST));
  if (fastDay) {
    return ['Tzom Kal', 'We wish you an easy fast'];
  }
  if (holidays[0]) {
    const desc = holidays[0].basename();
    if (chagSameach[desc]) {
      const url = holidays[0].url();
      return ['Chag Sameach', `We wish you a happy <a href="${url}">${desc}</a>`];
    }
  }
  return [undefined, undefined];
}
