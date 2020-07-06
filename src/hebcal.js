import {HebrewCalendar, Location, HDate} from '@hebcal/core';
import {eventsToIcalendarStream, eventsToCsv, getCalendarTitle, getEventCategories} from '@hebcal/icalendar';
import '@hebcal/locales';
import {createPdfDoc, renderPdf} from './pdf';
import {Readable} from 'stream';

const negativeOpts = {
  nx: 'noRoshChodesh',
  mod: 'noModern',
  mf: 'noMinorFast',
  ss: 'noSpecialShabbat',
};

const booleanOpts = {
  d: 'addHebrewDates',
  D: 'addHebrewDatesForEvents',
  o: 'omer',
  a: 'ashkenazi',
  c: 'candlelighting',
  i: 'il',
  s: 'sedrot',
  F: 'dafyomi',
  euro: 'euro',
};

const numberOpts = {
  m: 'havdalahMins',
  b: 'candleLightingMins',
  ny: 'numYears',
};

const maxNumYear = {
  candlelighting: 4,
  omer: 4,
  addHebrewDatesForEvents: 3,
  addHebrewDates: 2,
  dafyomi: 2,
};

/**
 * @param {string} val
 * @return {boolean}
 */
function empty(val) {
  return typeof val == 'undefined' || !val.length;
}

/**
 * @param {string} val
 * @return {boolean}
 */
function off(val) {
  return typeof val == 'undefined' || val == 'off' || val == '0';
}

const geoposLegacy = {
  ladeg: 90,
  lamin: 60,
  lodeg: 180,
  lomin: 60,
};

const lgToLocale = {
  h: 'he',
  a: 'ashkenazi',
  ah: 'ashkenazi',
  s: 's',
  sh: 's',
};

/**
 * Read Koa request parameters and create HebcalOptions
 * @param {any} db
 * @param {any} query
 * @return {HebcalOptions}
 */
function makeHebcalOptions(db, query) {
  const options = {};
  for (const [key, val] of Object.entries(booleanOpts)) {
    if (typeof query[key] == 'string' &&
      (query[key] == 'on' || query[key] == '1')) {
      options[val] = true;
    }
  }
  for (const [key, val] of Object.entries(negativeOpts)) {
    if (off(query[key])) {
      options[val] = true;
    }
  }
  if (typeof query.nh == 'undefined' && typeof query.maj == 'undefined') {
    options.noHolidays = true;
  }
  // legacy: before we had maj/min/mod/ss/mf, we only had nh/nx.
  // disable minor holidays only if we are sure it's not an old URL
  if ((query.nh != 'on' || query.nx != 'on') && off(query.min)) {
    options.noMinorHolidays = true;
  }
  for (const [key, val] of Object.entries(numberOpts)) {
    if (typeof query[key] == 'string' && query[key].length) {
      options[val] = +query[key];
    }
  }
  if (!empty(query.yt)) {
    options.isHebrewYear = Boolean(query.yt == 'H');
  }
  if (!empty(query.year)) {
    if (query.year == 'now') {
      options.year = options.isHebrewYear ? new HDate().getFullYear() : new Date().getFullYear();
    } else {
      options.year = +query.year;
    }
  }
  if (!empty(query.month)) {
    const month = +query.month;
    if (month >= 1 && month <= 12) {
      options.month = month;
    }
  }
  if (!empty(query.lg)) {
    options.locale = lgToLocale[query.lg] || query.lg;
  }
  if (options.candlelighting) {
    const location = getLocationFromQuery(db, query, options.il);
    if (location) {
      options.location = location;
      if (location.getIsrael()) {
        options.il = true;
      }
    } else {
      delete options.candlelighting;
    }
  }
  return options;
}

/**
 * @param {any} db
 * @param {any} query
 * @param {boolean} il
 * @return {Location}
 */
function getLocationFromQuery(db, query, il) {
  let location;
  if (!empty(query.zip)) {
    location = db.lookupZip(query.zip);
    if (location == null) {
      throw new Error(`Sorry, can't find ZIP code ${query.zip}`);
    }
  } else if (!empty(query.city)) {
    location = db.lookupLegacyCity(query.city);
    if (location == null) {
      throw new Error(`Invalid legacy city ${query.city}`);
    }
  } else if (!empty(query.geonameid)) {
    location = db.lookupGeoname(+query.geonameid);
    if (location == null) {
      throw new Error(`Sorry, can't find geonameid ${query.geonameid}`);
    }
  } else if (query.geo == 'pos') {
    if (!empty(query.latitude) && !empty(query.longitude)) {
      if (empty(query.tzid)) {
        throw new Error('Timezone required');
      }
      if (query.tzid == 'Asia/Jerusalem') {
        il = true;
      }
      location = new Location(+query.latitude, +query.longitude, il, query.tzid);
    } else {
      let tzid = query.tzid;
      if (empty(tzid) && !empty(query.tz) && !empty(query.dst)) {
        tzid = Location.legacyTzToTzid(query.tz, query.dst);
        if (!tzid && query.dst == 'none') {
          const tz = +query.tz;
          const plus = tz > 0 ? '+' : '';
          tzid = `Etc/GMT${plus}${tz}`;
        }
      }
      if (!tzid) {
        throw new Error('Timezone required');
      }
      for (const [key, max] of Object.entries(geoposLegacy)) {
        if (empty(query[key]) || +query[key] > max) {
          throw new RangeError(`Sorry, ${key}=${query[key]} out of valid range 0-${max}`);
        }
      }
      let latitude = +query.ladeg + (+query.lamin / 60.0);
      let longitude = +query.lodeg + (+query.lomin / 60.0);
      if (query.ladir == 's') {
        latitude *= -1;
      }
      if (query.lodir == 'w') {
        longitude *= -1;
      }
      if (tzid == 'Asia/Jerusalem') {
        il = true;
      }
      location = new Location(latitude, longitude, il, tzid);
    }
  }
  return location;
}

/**
 * Parse HebcalOptions to determine ideal numYears
 * @param {HebcalOptions} options
 * @return {number}
 */
function getNumYears(options) {
  if (options.numYears) {
    return options.numYears;
  }

  if ((!options.isHebrewYear && options.year < 2016) ||
      (options.isHebrewYear && options.year < 5776)) {
    return 1;
  }

  let numYears = 5;
  for (const [key, ny] of Object.entries(maxNumYear)) {
    if (options[key] && ny < numYears) {
      numYears = ny;
    }
  }
  // Shabbat plus Hebrew Event every day can get very big
  const hebrewDates = options.addHebrewDates || options.addHebrewDatesForEvents;
  if (options.candlelighting && hebrewDates) {
    numYears = 2;
  }
  // reduce size of file for truly crazy people who specify both Daf Yomi and Hebrew Date every day
  if (options.dafyomi && hebrewDates) {
    numYears = 1;
  }
  return numYears;
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function hebcalDownload(ctx) {
  const query = ctx.request.query;
  if (query.v !== '1') {
    return;
  }
  let options;
  try {
    options = makeHebcalOptions(ctx.db, query);
  } catch (err) {
    ctx.throw(400, err.message);
  }
  const path = ctx.request.path;
  const extension = path.substring(path.length - 4);
  if (extension == '.ics' || extension == '.csv') {
    options.numYears = getNumYears(options);
  }
  ctx.logger.info(options);
  let events = HebrewCalendar.calendar(options);
  if (options.noMinorHolidays) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      if (categories.length > 1 && categories[1] == 'minor') {
        return false;
      }
      return true;
    });
  }
  if (!events.length) {
    ctx.throw(400, 'Please select at least one event option');
  }
  if (extension == '.ics') {
    ctx.response.type = 'text/calendar; charset=utf-8';
    const readable = ctx.body = new Readable();
    eventsToIcalendarStream(readable, events, options);
  } else if (extension == '.csv') {
    const ical = eventsToCsv(events, options);
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = ical;
  } else if (extension == '.pdf') {
    ctx.response.type = 'application/pdf';
    const title = getCalendarTitle(events, options);
    const doc = ctx.body = createPdfDoc(title);
    renderPdf(doc, events, options);
    doc.end();
  }
}
