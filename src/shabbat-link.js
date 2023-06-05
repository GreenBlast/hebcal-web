/* eslint-disable require-jsdoc */
import {getLocationFromQuery, langNames, makeGeoUrlArgs2} from './common';

export async function shabbatJsLink(ctx) {
  const q = ctx.request.querystring ? ctx.request.query : {geonameid: '281184', M: 'on'};
  const location0 = getLocationFromQuery(ctx.db, q);
  const location = location0 || ctx.db.lookupLegacyCity('New York');
  const geoUrlArgs = makeGeoUrlArgs2(q, location);
  const geoUrlArgsDbl = geoUrlArgs.replace(/&/g, '&amp;');
  await ctx.render('link', {
    q, geoUrlArgs, geoUrlArgsDbl,
    locationName: location.getName(),
    title: 'Embed Shabbat candle-lighting times in your website - Hebcal',
    langNames,
  });
}
