/* eslint-disable require-jsdoc */
import {HebrewCalendar, Locale} from '@hebcal/core';
import {makeHebcalOptions, processCookieAndQuery, possiblySetCookie, empty} from './common';
import '@hebcal/locales';
import dayjs from 'dayjs';
import {countryNames, getEventCategories, makeAnchor, eventsToRss, eventsToClassicApi} from '@hebcal/rest-api';

export async function shabbatApp(ctx) {
  makeItems(ctx);
  const q = ctx.state.q;
  if (q.cfg === 'i') {
    return ctx.render('shabbat-iframe', {});
  } else if (q.cfg === 'j') {
    const html = await ctx.render('shabbat-js', {writeResp: false});
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Cache-Control', 'max-age=86400');
    ctx.type = 'text/javascript';
    ctx.body = html.split('\n').map((line) => {
      return 'document.write("' + line.replace(/"/g, '\\"') + '");\n';
    }).join('');
  } else if (q.cfg === 'r') {
    ctx.set('Cache-Control', 'max-age=86400');
    ctx.type = 'application/rss+xml; charset=utf-8';
    const selfUrl = `https://www.hebcal.com/shabbat/?${ctx.state.geoUrlArgs}`;
    ctx.body = eventsToRss(ctx.state.events, ctx.state.location,
        selfUrl, ctx.state.rssUrl, ctx.state.locale, q.pubDate != 0);
  } else if (q.cfg === 'json') {
    ctx.set('Cache-Control', 'max-age=86400');
    let obj = eventsToClassicApi(ctx.state.events, ctx.state.options);
    if (q.leyning === 'off') {
      for (const item of obj.items) {
        delete item.leyning;
      }
    }
    const cb = q.callback;
    if (typeof cb === 'string' && cb.length) {
      obj = cb + '(' + JSON.stringify(obj) + ')\n';
    }
    ctx.body = obj;
  } else {
    const cookie = ctx.cookies.get('C');
    const p = makePropsForFullHtml(ctx);
    if (ctx.request.querystring.length === 0 && cookie && cookie.length) {
      ctx.set('Cache-Control', 'private');
    } else {
      possiblySetCookie(ctx, q);
    }
    return ctx.render('shabbat', p);
  }
}

/**
 * Gets start and end days for filtering relevant hebcal events
 * @param {Date} now
 * @return {dayjs.Dayjs[]}
 */
function getStartAndEnd(now) {
  let midnight = dayjs(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const dow = midnight.day();
  // back up to Friday if today is Saturday (include last night's candle-lighting times)
  if (dow == 6) {
    midnight = midnight.subtract(1, 'day');
  }
  const saturday = midnight.add(6 - dow, 'day');
  const fiveDaysAhead = midnight.add(5, 'day');
  const endOfWeek = fiveDaysAhead.isAfter(saturday) ? fiveDaysAhead : saturday;
  return [midnight, endOfWeek];
}

function makeItems(ctx) {
  const q = processCookieAndQuery(
      ctx.cookies.get('C'),
      {c: 'on', tgt: '_top'},
      ctx.request.query,
  );
  let opts0;
  try {
    opts0 = makeHebcalOptions(ctx.db, q);
  } catch (err) {
    ctx.throw(400, err.message);
  }
  const location = opts0.location || ctx.db.lookupLegacyCity('New York');
  q['city-typeahead'] = location.getName();
  if (!opts0.location) {
    q.geonameid = location.getGeoId();
    q.geo = 'geoname';
  }
  q.M = typeof opts0.havdalahMins === 'undefined' ? 'on' : 'off';
  if (q.M === 'off' && !isNaN(opts0.havdalahMins)) {
    options.havdalahMins = opts0.havdalahMins;
  }
  const dt = (!empty(q.gy) && !empty(q.gm) && !empty(q.gd)) ?
      new Date(+q.gy, +q.gm - 1, +q.gd) : new Date();
  const [midnight, endOfWeek] = getStartAndEnd(dt);
  const options = {
    start: midnight.toDate(),
    end: endOfWeek.toDate(),
    candlelighting: true,
    location,
    locale: opts0.locale,
    il: opts0.il,
    sedrot: true,
  };
  const events = HebrewCalendar.calendar(options);
  Object.assign(ctx.state, {
    events,
    options,
    q,
    location,
    locale: Locale.getLocaleName(),
    hyear: events[0].getDate().getFullYear(),
    items: events.map((ev) => eventToItem(ev, options)),
    title: Locale.gettext('Shabbat') + ' Times for ' + location.getName(),
    Shabbat: Locale.gettext('Shabbat'),
  });

  let geoUrlArgs = q.zip ? `zip=${q.zip}` : `geonameid=${location.getGeoId()}`;
  if (typeof options.havdalahMins !== 'undefined') {
    geoUrlArgs += '&m=' + options.havdalahMins;
  }
  geoUrlArgs += `&M=${q.M}&lg=` + (q.lg || 's');
  Object.assign(ctx.state, {
    geoUrlArgs,
    rssUrl: `https://www.hebcal.com/shabbat/?cfg=r&${geoUrlArgs}&pubDate=0`,
  });
}

function makePropsForFullHtml(ctx) {
  const items = ctx.state.items;
  const location = ctx.state.location;
  const briefText = items.map((i) => {
    const date = i.d.format('MMM D');
    if (i.fmtTime) {
      return `${i.desc} at ${i.fmtTime} on ${date}`;
    } else if (i.cat === 'parashat') {
      return i.desc;
    } else {
      return `${i.desc} on ${date}`;
    }
  });
  const firstCandles = items.find((i) => i.cat === 'candles');
  return {
    summary: briefText.join('. '),
    jsonLD: firstCandles && location.getGeoId() ? JSON.stringify(getJsonLD(firstCandles, location)) : '',
    locationName: location.getName(),
    xtra_html:
`<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/typeahead.js/0.10.4/typeahead.bundle.min.js"></script>
<script src="https://www.hebcal.com/i/hebcal-app-1.9.min.js"></script>
<script>
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="tooltip"]'));
var tooltipList = tooltipTriggerList.map(function (el) {
  return new bootstrap.Tooltip(el);
});
window['hebcal'].createCityTypeahead(false);
</script>`,
  };
}

function getJsonLD(item, location) {
  const admin1 = location.admin1 || '';
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': `Candle Lighting for ${location.getShortName()} at ${item.fmtTime}`,
    'startDate': `${item.isoDate}T${item.isoTime}:00`,
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'eventStatus': 'https://schema.org/EventScheduled',
    'location': {
      '@type': 'Place',
      'name': location.getName(),
      'address': {
        '@type': 'PostalAddress',
        'addressLocality': location.getShortName(),
        'addressRegion': admin1,
        'addressCountry': countryNames[location.getCountryCode()],
      },
      'geo': {
        '@type': 'GeoCoordinates',
        'latitude': location.getLatitude(),
        'longitude': location.getLongitude(),
      },
    },
  };
}

/**
 * @param {Event} ev
 * @param {HebrewCalendar.Options} options
 * @return {Object}
 */
function eventToItem(ev, options) {
  const desc = ev.getDesc();
  const hd = ev.getDate();
  const d = dayjs(hd.greg());
  const attrs = ev.getAttrs();
  const fmtDate = d.format('dddd, D MMMM YYYY');
  const isoDate = d.format('YYYY-MM-DD');
  const categories = getEventCategories(ev);
  const cat0 = categories[0];
  const id = d.format('YYYYMMDD') + '-' + makeAnchor(desc);
  if (desc.startsWith('Candle lighting') || desc.startsWith('Havdalah')) {
    const hourMin = HebrewCalendar.reformatTimeStr(attrs.eventTimeStr, 'pm', options);
    const subj = ev.render();
    const shortDesc = subj.substring(0, subj.indexOf(':'));
    return {
      id,
      desc: shortDesc,
      cat: cat0,
      d,
      isoDate,
      isoTime: attrs.eventTimeStr,
      fmtDate,
      fmtTime: hourMin,
    };
  } else {
    return {
      id,
      desc: ev.render(),
      cat: cat0,
      d,
      isoDate,
      fmtDate,
      url: ev.url(),
    };
  }
}
