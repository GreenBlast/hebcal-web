import {HebrewCalendar, HDate, Event, flags, months} from '@hebcal/core';
import {eventsToIcalendarStream} from '@hebcal/icalendar';
import {eventsToCsv} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import {Readable} from 'stream';
import {basename} from 'path';
import {empty} from './common';

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitApp(ctx) {
  const defaults = (ctx.request.body && ctx.request.body.v === 'yahrzeit') ? {} : {
    hebdate: 'on',
    yizkor: 'off',
    count: 6,
    years: 20,
  };
  const q = Object.assign(defaults, ctx.request.body, ctx.request.query);
  const tables = processForm(q);
  await ctx.render('yahrzeit-form', {
    title: 'Yahrzeit + Anniversary Calendar | Hebcal Jewish Calendar',
    q,
    tables,
  });
}

// eslint-disable-next-line require-jsdoc
function processForm(q) {
  if (q.v !== 'yahrzeit') {
    return null;
  }
  const events = makeYahrzeitEvents(q);
  const items = events.map((ev) => {
    const dt = ev.getDate().greg();
    return {
      date: dayjs(dt).format('ddd, D MMM YYYY'),
      desc: ev.render(),
      year: dt.getFullYear(),
    };
  });
  if (q.yizkor !== 'on') {
    return new Map([['', items]]);
  }
  return items.reduce((m, val) => {
    const arr = m.get(val.year);
    if (arr) {
      arr.push(val);
    } else {
      m.set(val.year, [val]);
    }
    return m;
  }, new Map());
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitDownload(ctx) {
  const query = ctx.request.query;
  if (query.v !== 'yahrzeit') {
    return;
  }
  ctx.logger.debug(Object.assign({
    ip: ctx.request.header['x-client-ip'] || ctx.request.ip,
    url: ctx.request.originalUrl,
  }, query));
  const events = makeYahrzeitEvents(query);
  if (events.length === 0) {
    ctx.throw(400, 'No events');
  }
  const path = ctx.request.path;
  const extension = path.substring(path.length - 4);
  if (!query.subscribe) {
    ctx.response.attachment(basename(path));
  }
  if (extension == '.ics') {
    ctx.response.type = 'text/calendar; charset=utf-8';
    const readable = ctx.body = new Readable();
    eventsToIcalendarStream(readable, events, {yahrzeit: true});
  } else if (extension == '.csv') {
    const euro = Boolean(query.euro);
    const ical = eventsToCsv(events, {euro});
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = ical;
  }
}

/**
 * @param {any} query
 * @return {Event[]}
 */
export function makeYahrzeitEvents(query) {
  const ids = Object.keys(query)
      .filter((k) => k[0] == 'y' && k.charCodeAt(1) >= 48 && k.charCodeAt(1) <= 57)
      .map((k) => +(k.substring(1)));
  const maxId = Math.max(...ids);
  const years = +query.years || 20;
  const startYear = new HDate().getFullYear();
  const endYear = startYear + years;
  let events = [];
  for (let id = 1; id <= maxId; id++) {
    events = events.concat(getEventsForId(query, id, startYear, endYear));
  }
  if (query.yizkor == 'on') {
    const holidays = makeYizkorEvents(startYear, endYear);
    events = events.concat(holidays);
  }
  events.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  return events;
}

/**
 * @param {any} query
 * @param {number} id
 * @param {number} startYear
 * @param {number} endYear
 * @return {Event[]}
 */
function getEventsForId(query, id, startYear, endYear) {
  const events = [];
  const [dd, mm, yy] = [
    query[`d${id}`],
    query[`m${id}`],
    query[`y${id}`],
  ];
  if (empty(dd) || empty(mm) || empty(yy)) {
    return events;
  }
  const type = query[`t${id}`] || 'Yahrzeit';
  const sunset = query[`s${id}`];
  const name = query[`n${id}`] || `Person${id}`;
  let day = dayjs(new Date(yy, mm - 1, dd));
  if (sunset === 'on') {
    day = day.add(1, 'day');
  }
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    const hd = (type == 'Yahrzeit') ?
      HebrewCalendar.getYahrzeit(hyear, day.toDate()) :
      HebrewCalendar.getBirthdayOrAnniversary(hyear, day.toDate());
    if (hd) {
      const typeStr = (type == 'Yahrzeit') ? type : `Hebrew ${type}`;
      let subj = `${name}'s ${typeStr}`;
      if (query.hebdate == 'on') {
        const hebdate = hd.render('en');
        const comma = hebdate.indexOf(',');
        subj += ' (' + hebdate.substring(0, comma) + ')';
      }
      events.push(new Event(hd, subj, flags.USER_EVENT));
    }
  }
  return events;
}

/**
 * @param {number} startYear
 * @param {number} endYear
 * @return {Event[]}
 */
function makeYizkorEvents(startYear, endYear) {
  const holidays = [];
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    holidays.push(
        new Event(new HDate(22, months.NISAN, hyear), 'Yizkor (Pesach VIII)', flags.USER_EVENT),
        new Event(new HDate(7, months.SIVAN, hyear), 'Yizkor (Shavuot II)', flags.USER_EVENT),
        new Event(new HDate(10, months.TISHREI, hyear), 'Yizkor (Yom Kippur)', flags.USER_EVENT),
        new Event(new HDate(22, months.TISHREI, hyear), 'Yizkor (Shmini Atzeret)', flags.USER_EVENT),
    );
  }
  return holidays;
}
