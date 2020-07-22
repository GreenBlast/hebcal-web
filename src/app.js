import Koa from 'koa';
import compress from 'koa-compress';
import conditional from 'koa-conditional-get';
import etag from 'koa-etag';
import render from 'koa-ejs';
import serve from 'koa-static';
import error from 'koa-error';
import path from 'path';
import pino from 'pino';
import {hebrewDateConverter} from './converter';
import {fridgeShabbat} from './fridge';
import {GeoDb} from '@hebcal/geo-sqlite';
import {shabbatApp} from './shabbat';
import {geoAutoComplete} from './complete';
import {homepage} from './homepage';
import maxmind from 'maxmind';
import {hebcalApp} from './hebcal';

const app = new Koa();

const logDir = process.env.NODE_ENV == 'production' ? '/var/log/hebcal' : '.';
const dest = pino.destination(logDir + '/access.log');
const logger = app.context.logger = pino(dest);

const zipsFilename = 'zips.sqlite3';
const geonamesFilename = 'geonames.sqlite3';
app.context.db = new GeoDb(logger, zipsFilename, geonamesFilename);

app.use(async (ctx, next) => {
  if (!ctx.lookup) {
    const mmdbPath = 'GeoLite2-Country.mmdb';
    logger.info(`Opening ${mmdbPath}`);
    ctx.lookup = app.context.lookup = await maxmind.open(mmdbPath);
  }
  await next();
});

app.use(async (ctx, next) => {
  ctx.state.rpath = ctx.request.path;
  ctx.state.startTime = Date.now();
  // don't allow compress middleware to assume that a missing
  // accept-encoding header implies 'accept-encoding: *'
  if (typeof ctx.request.header['accept-encoding'] == 'undefined') {
    ctx.request.header['accept-encoding'] = 'identity';
  }
  await next();
});

app.on('error', (err, ctx) => {
  logger.error(Object.assign(err, {
    ip: ctx.request.header['x-client-ip'] || ctx.request.ip,
    url: ctx.request.originalUrl,
  }));
});

app.use(conditional());
app.use(etag());
app.use(compress({
  threshold: 2048,
  gzip: true,
  deflate: true,
  br: true,
}));

render(app, {
  root: path.join(__dirname, 'views'),
  layout: false,
  viewExt: 'ejs',
  debug: false,
  async: true,
});

// Fix up querystring so we can later use ctx.request.query
app.use(async (ctx, next) => {
  const qs = ctx.request.querystring;
  if (qs && qs.length) {
    const semi = qs.indexOf(';');
    if (semi != -1) {
      ctx.request.querystring = qs.replace(/;/g, '&');
    }
  }
  // force error middleware to use proper json response type
  const accept = ctx.request.header['accept'];
  const cfg = ctx.request.query.cfg;
  if ((cfg === 'json' || cfg === 'fc') && (!accept || accept === '*' || accept === '*/*')) {
    ctx.request.header['accept'] = 'application/json';
  }
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = err.message;
    ctx.app.emit('error', err, ctx);
  }
});

app.use(error({
  engine: 'ejs',
  template: path.join(__dirname, 'views', 'error.ejs'),
}));

// request dispatcher
app.use(async (ctx, next) => {
  const rpath = ctx.request.path;
  if (rpath == '/favicon.ico' || rpath.startsWith('/i/')) {
    ctx.set('Cache-Control', 'max-age=5184000');
    // let serve() handle this file
  } else if (rpath == '/robots.txt') {
    ctx.body = 'User-agent: *\nAllow: /\n';
  } else if (rpath == '/') {
    await homepage(ctx);
  } else if (rpath.startsWith('/complete')) {
    await geoAutoComplete(ctx);
  } else if (rpath.startsWith('/fridge') || rpath.startsWith('/shabbat/fridge.cgi')) {
    await fridgeShabbat(ctx);
  } else if (rpath.startsWith('/converter')) {
    await hebrewDateConverter(ctx);
  } else if (rpath.startsWith('/shabbat')) {
    await shabbatApp(ctx);
  } else if (rpath.startsWith('/hebcal/')) {
    await hebcalApp(ctx);
  }
  await next();
});

app.use(serve('/var/www/html', {defer: true}));

// logger
app.use(async (ctx) => {
  const duration = Date.now() - ctx.state.startTime;
  logger.info({
    status: ctx.response.status,
    length: ctx.response.length,
    ip: ctx.request.header['x-client-ip'] || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.request.header['user-agent'],
    ref: ctx.request.header['referer'],
    cookie: ctx.request.header['cookie'],
    duration,
  });
});

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => console.log('Koa server listening on port ' + port));
