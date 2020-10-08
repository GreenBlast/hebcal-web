/* eslint-disable require-jsdoc */
import {makeHebcalOptions, processCookieAndQuery, possiblySetCookie,
  empty, urlArgs, downloadHref, tooltipScript, typeaheadScript,
  getDefaultHebrewYear, makeHebrewCalendar} from './common';
import {HebrewCalendar, Locale, greg, flags, HDate} from '@hebcal/core';
import {eventsToClassicApi, eventToFullCalendar, pad2, getDownloadFilename,
  getEventCategories, getHolidayDescription} from '@hebcal/rest-api';
import {basename} from 'path';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import 'dayjs/locale/fi';
import 'dayjs/locale/fr';
import 'dayjs/locale/he';
import 'dayjs/locale/hu';
import 'dayjs/locale/pl';
import 'dayjs/locale/ru';
import fs from 'fs';
import readline from 'readline';

dayjs.extend(localeData);

const hebcalFormDefaults = {
  maj: 'on',
  min: 'on',
  nx: 'on',
  mf: 'on',
  ss: 'on',
  mod: 'on',
  i: 'off',
  yt: 'G',
  lg: 's',
  b: 18,
  M: 'on',
};

export async function hebcalApp(ctx) {
  if (ctx.request.method === 'POST') {
    ctx.set('Allow', 'GET');
    ctx.throw(405, 'POST not allowed; try using GET instead');
  }
  const cookie = ctx.cookies.get('C');
  const q = (ctx.request.querystring.length === 0 && !cookie) ?
    Object.assign({}, hebcalFormDefaults) :
    ctx.request.query.v === '1' ? ctx.request.query :
    processCookieAndQuery(cookie, hebcalFormDefaults, ctx.request.query);
  let error;
  let options = {};
  try {
    options = makeHebcalOptions(ctx.db, q);
  } catch (err) {
    if (q.cfg === 'json' || q.cfg === 'fc') {
      ctx.throw(400, err);
    } else if (q.v === '1') {
      q.v = '0';
      error = err;
    }
  }
  if (options.il) {
    q.i = 'on';
  }
  if (options.location) {
    q['city-typeahead'] = options.location.getName();
  }
  if (empty(q.year) && q.cfg !== 'fc') {
    q.year = options.year = options.isHebrewYear ?
        new HDate().getFullYear() : new Date().getFullYear();
  }
  ctx.state.q = q;
  ctx.state.options = options;
  ctx.state.location = options.location;
  if (q.cfg === 'json') {
    renderJson(ctx);
  } else if (q.cfg === 'fc') {
    renderFullCalendar(ctx);
  } else if (q.cfg === 'e' || q.cfg === 'e2') {
    ctx.body = renderLegacyJavascript(ctx);
  } else {
    if (q.v === '1') {
      return renderHtml(ctx);
    } else {
      return renderForm(ctx, error);
    }
  }
}

async function renderForm(ctx, error) {
  const message = error ? error.message : undefined;
  const cookie = ctx.cookies.get('C');
  if (ctx.request.querystring.length === 0 && cookie && cookie.length) {
    // private cache only if we're tailoring results by cookie
    ctx.set('Cache-Control', 'private');
  }
  if (error) {
    ctx.status = 400;
  }
  const defaultYear = new Date().getFullYear();
  const defaultYearHeb = getDefaultHebrewYear(new HDate());
  const tzids = ctx.state.q.geo === 'pos' ? await getTzids() : [];
  return ctx.render('hebcal-form', {
    message,
    title: 'Custom Calendar | Hebcal Jewish Calendar',
    tzids,
    xtra_html: typeaheadScript + tooltipScript +
`<script>
var d=document;
function s6(val){
if(val=='G'){d.f1.year.value=${defaultYear};}
if(val=='H'){d.f1.year.value=${defaultYearHeb};}
return false;}
d.getElementById("maj").onclick=function(){
 if (this.checked == false) {
  ["nx","mf","ss","min","mod"].forEach(function(x){
   d.f1[x].checked = false;
  });
 }
};
["nx","mf","ss","min","mod"].forEach(function(x){
 d.getElementById(x).onclick=function(){if(this.checked==true){d.f1.maj.checked=true;}}
});
d.getElementById("d1").onclick=function(){
 if (this.checked) {
  d.getElementById("d2").checked = false;
 }
}
d.getElementById("d2").onclick=function(){
 if (this.checked) {
  d.getElementById("d1").checked = false;
 }
}
</script>`,
  });
}

async function getTzids() {
  return new Promise((resolve, reject) => {
    const infile = '/usr/share/zoneinfo/zone.tab';
    const result = [];
    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(infile),
        crlfDelay: Infinity,
      });
      rl.on('line', (line) => {
        if (line[0] !== '#') {
          result.push(line.split('\t')[2]);
        }
      });
      rl.on('close', () => resolve(result.sort()));
      rl.on('error', (err) => reject(err));
    } catch (err) {
      return reject(err);
    }
  });
}

const localeMap = {
  'fi': 'fi',
  'fr': 'fr',
  'he': 'he',
  'hu': 'hu',
  'h': 'he',
  'pl': 'pl',
  'ru': 'ru',
};

function renderHtml(ctx) {
  const options = ctx.state.options;
  const locationName = ctx.state.location ? ctx.state.location.getName() : options.il ? 'Israel' : 'Diaspora';
  let shortTitle = 'Jewish Calendar ';
  if (options.month) {
    shortTitle += greg.monthNames[options.month] + ' ';
  }
  shortTitle += options.year;
  let events = makeHebrewCalendar(ctx, options);
  if (options.noMinorHolidays) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      return categories.length < 2 || categories[1] !== 'minor';
    });
  }
  if (events.length === 0) {
    return renderForm(ctx, {message: 'Please select at least one event option'});
  }
  const months = makeMonthlyDates(events);
  if (months.length > 14) {
    throw new Error(`Something is wrong; months.length=${months.length}`);
  }
  const result = eventsToClassicApi(events, options, false);
  // Reduce size of HTML
  result.items.forEach((i) => {
    delete i.memo;
    if (typeof i.link === 'string' && i.link.startsWith('https://www.hebcal.com/')) {
      i.link = i.link.substring(22);
      const utm = i.link.indexOf('utm_source=');
      if (utm !== -1) {
        i.link = i.link.substring(0, utm - 1);
      }
    }
  });
  const q = ctx.state.q;
  if (q.set !== 'off') {
    possiblySetCookie(ctx, q);
  }
  const locale = localeMap[Locale.getLocaleName()] || 'en';
  const localeData = dayjs().locale(locale).localeData();
  const dlFilename = getDownloadFilename(options);
  const dlhref = downloadHref(q, dlFilename);
  const subical = downloadHref(q, dlFilename, {year: 'now', subscribe: 1}) + '.ics';
  const url = {
    canonical: 'https://www.hebcal.com/hebcal?' + urlArgs(q),
    settings: '/hebcal?' + urlArgs(q, {v: 0}),
    prev: '/hebcal?' + urlArgs(q, {year: options.year - 1}),
    next: '/hebcal?' + urlArgs(q, {year: options.year + 1}),
    pdf: dlhref + '.pdf',
    ics: dlhref + '.ics',
    subical: subical,
    webcal: subical.replace(/^https/, 'webcal'),
    gcal: encodeURIComponent(subical.replace(/^https/, 'http')),
    csv_usa: dlhref + '_usa.csv',
    csv_eur: downloadHref(q, dlFilename, {euro: 1}) + '_eur.csv',
  };
  const filenames = {
    ics: basename(url.ics),
    pdf: basename(url.pdf),
    csv_usa: basename(url.csv_usa),
    csv_eur: basename(url.csv_eur),
  };
  if (options.candlelighting) {
    const location = ctx.state.location;
    let geoUrlArgs = q.zip ? `zip=${q.zip}` : `geonameid=${location.getGeoId()}`;
    if (typeof options.havdalahMins !== 'undefined') {
      geoUrlArgs += '&m=' + options.havdalahMins;
    }
    geoUrlArgs += `&M=${q.M}&lg=` + (q.lg || 's');
    const hyear = events[events.length - 1].getDate().getFullYear();
    url.fridge = `/shabbat/fridge.cgi?${geoUrlArgs}&year=${hyear}`;
  }
  const endYear = options.year + getNumYears(options) - 1;
  const downloadTitle = `${options.year}-${endYear}`;
  return ctx.render('hebcal-results', {
    items: result.items,
    cconfig: JSON.stringify(Object.assign({geo: q.geo || 'none'}, result.location)),
    today: dayjs(),
    dates: months,
    gy: months[0].year(),
    tableBodies: makeTableBodies(events, months, options, locale),
    locale,
    weekdaysShort: localeData.weekdaysShort(),
    prevTitle: options.year - 1,
    nextTitle: options.year + 1,
    url,
    filename: filenames,
    downloadTitle,
    shortTitle,
    locationName,
    title: shortTitle + ' ' + locationName + ' | Hebcal Jewish Calendar',
    xtra_html: `
<script src="https://cdnjs.cloudflare.com/ajax/libs/clipboard.js/2.0.6/clipboard.min.js"></script>
<script>
var clipboard = new ClipboardJS('#grabBtn', {
    container: document.getElementsByClassName('modal')[0]
});
var grabBtn = document.querySelector('#grabBtn');
var tooltipBtn=new bootstrap.Tooltip(grabBtn);
clipboard.on('success', function(e) {
  var tooltipBtn=bootstrap.Tooltip.getInstance(e.trigger);
  e.trigger.setAttribute('data-original-title','Copied!');
  tooltipBtn.show();
  e.trigger.setAttribute('data-original-title','Copy to clipboard');
  e.clearSelection();
});
clipboard.on('error', function(e) {
  var modifierKey=/mac/i.test(navigator.userAgent)?'\u2318':'Ctrl-';
  var fallbackMsg='Press '+modifierKey+'C to copy';
  var tooltipBtn=bootstrap.Tooltip.getInstance(e.trigger);
  e.trigger.setAttribute('data-original-title',fallbackMsg);
  tooltipBtn.show();
  e.trigger.setAttribute('data-original-title','Copy to clipboard');
});
</script>
`,
  });
}

const maxNumYear = {
  candlelighting: 4,
  omer: 4,
  addHebrewDatesForEvents: 3,
  addHebrewDates: 2,
  dafyomi: 2,
};

function getNumYears(options) {
  let numYears = 5;
  for (const [key, ny] of Object.entries(maxNumYear)) {
    if (options[key] && ny < numYears) {
      numYears = ny;
    }
  }
  return numYears;
}

function makeTableBodies(events, months, options, locale) {
  const eventMap = new Map();
  for (const ev of events) {
    const key = dayjs(ev.date.greg()).format('YYYY-MM-DD');
    if (eventMap.has(key)) {
      eventMap.get(key).push(ev);
    } else {
      eventMap.set(key, [ev]);
    }
  }
  const tableBodies = {};
  for (const d of months) {
    let html = '<tr>';
    const dow = d.day();
    for (let i = 0; i < dow; i++) {
      html += '<td>&nbsp;</td>';
    }
    let n = dow;
    const daysInMonth = greg.daysInMonth(d.month() + 1, d.year());
    const yearMonth = d.format('YYYY-MM');
    for (let i = 1; i <= daysInMonth; i++) {
      html += `<td><p><b>${i}</b></p>`;
      const evs = eventMap.get(yearMonth + '-' + pad2(i)) || [];
      for (const ev of evs) {
        html += renderEventHtml(ev, options, locale);
      }
      html += '</td>\n';
      n++;
      if (n % 7 === 0) {
        html += '</tr>\n<tr>';
      }
    }
    while (n % 7 !== 0) {
      html += '<td>&nbsp;</td>';
      n++;
    }
    html += '</tr>\n';
    if (html.endsWith('<tr></tr>\n')) {
      html = html.substring(0, html.length - 10);
    }
    tableBodies[yearMonth] = html;
  }
  return tableBodies;
}

/**
 * @param {Event} ev
 * @param {HebrewCalendar.Options} options
 * @param {string} locale
 * @return {string}
 */
function renderEventHtml(ev, options, locale) {
  const categories = getEventCategories(ev);
  const mask = ev.getFlags();
  if (categories[0] == 'holiday' && mask & flags.CHAG) {
    categories.push('yomtov');
  }
  let title = ev.render();
  const time = ev.eventTimeStr && HebrewCalendar.reformatTimeStr(ev.eventTimeStr, 'pm', options);
  if (time) {
    categories.push('timed');
    const colon = title.indexOf(':');
    if (colon !== -1 && !(mask & flags.CHANUKAH_CANDLES)) {
      title = '<small class="text-muted">' + time + '</small> ' + subjectSpan(locale, title.substring(0, colon));
    } else {
      title = '<small>' + time + '</small> ' + subjectSpan(locale, title);
    }
  } else if (mask & flags.DAF_YOMI) {
    const colon = title.indexOf(':');
    if (colon != -1) {
      title = subjectSpan(locale, title.substring(colon + 1));
    }
  } else {
    title = subjectSpan(locale, title);
  }
  const classes = categories.join(' ');
  const memo0 = getHolidayDescription(ev, true);
  const memo = memo0 ? ` title="${memo0}"` : '';
  let url = ev.url();
  if (typeof url === 'string' && url.startsWith('https://www.hebcal.com/')) {
    const suffix = options.il ? '?i=on' : '';
    url = url.substring(22) + suffix;
  }
  const ahref = url ? `<a href="${url}">` : '';
  const aclose = url ? '</a>' : '';
  const hebrew = options.appendHebrewToSubject ?
    '<br>' + subjectSpan('he', ev.renderBrief('he')) : '';
  // eslint-disable-next-line max-len
  return `<div class="fc-event ${classes}">${ahref}<span class="fc-title"${memo}>${title}${hebrew}</span>${aclose}</div>\n`;
}

/**
 * @param {string} locale
 * @param {string} str
 * @return {string}
 */
function subjectSpan(locale, str) {
  if (locale === 'he') {
    return '<span lang="he" dir="rtl">' + str + '</span>';
  }
  return str;
}

/**
 * Returns an array of dayjs objects for every month (including blanks) in the range
 * @param {Event[]} events
 * @return {dayjs.Dayjs[]}
 */
function makeMonthlyDates(events) {
  const startDate = dayjs(events[0].getDate().greg());
  const endDate = dayjs(events[events.length - 1].getDate().greg());
  const start = startDate.date(1);
  if (events.length === 1) {
    return [start];
  }
  const result = [];
  for (let d = start; d.isBefore(endDate); d = d.add(1, 'month')) {
    result.push(d);
  }
  return result;
}

function isFresh(ctx) {
  ctx.set('Last-Modified', ctx.launchUTCString);
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return true;
  }
  return false;
}

function renderFullCalendar(ctx) {
  if (isFresh(ctx)) {
    return;
  }
  const options = ctx.state.options;
  for (const param of ['start', 'end']) {
    if (typeof options[param] === 'undefined') {
      ctx.throw(400, `Please specify required parameter '${param}'`);
    }
  }
  const events = makeHebrewCalendar(ctx, options);
  const location = options.location;
  const tzid = location ? location.getTzid() : 'UTC';
  ctx.set('Cache-Control', 'max-age=604800');
  ctx.body = events.map((ev) => eventToFullCalendar(ev, tzid, options.il));
}

function renderJson(ctx) {
  if (isFresh(ctx)) {
    return;
  }
  const events = makeHebrewCalendar(ctx, ctx.state.options);
  const q = ctx.state.q;
  let obj = eventsToClassicApi(events, ctx.state.options, q.leyning !== 'off');
  const cb = q.callback;
  if (typeof cb === 'string' && cb.length) {
    obj = cb + '(' + JSON.stringify(obj) + ')\n';
  }
  ctx.set('Cache-Control', 'max-age=86400');
  ctx.body = obj;
}

function renderLegacyJavascript(ctx) {
  if (isFresh(ctx)) {
    return;
  }
  const options = ctx.state.options;
  options.numYears = 2;
  const events = makeHebrewCalendar(ctx, options);
  if (ctx.state.q.cfg === 'e') {
    const strs = events.map((ev) => {
      const d = dayjs(ev.getDate().greg());
      const fmtDt = d.format('YYYYMMDD');
      const desc = ev.render();
      const url = ev.url() || '';
      return `DefineEvent(${fmtDt},"${desc}","${url}","",0,0);`;
    });
    return strs.join('\n');
  } else {
    const strs = events.map((ev) => {
      const d = dayjs(ev.getDate().greg());
      const url = ev.url();
      const obj = {d: d.format('YYYYMMDD'), s: ev.render()};
      if (url) {
        obj.u = url;
      }
      return JSON.stringify(obj);
    });
    return 'if(typeof HEBCAL=="undefined"||!HEBCAL){var HEBCAL={};}\nHEBCAL.eraw=[\n' +
      strs.join(',') + `];
HEBCAL.jec2events=HEBCAL.eraw.map(function(e){
var f={eventDate:e.d,eventDescription:e.s};
if(e.u){f.eventLink=e.u}
return f;
});
`;
  }
}
