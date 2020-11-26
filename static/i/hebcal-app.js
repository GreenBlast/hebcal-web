/* eslint-disable max-len */
/* eslint-disable one-var */
/* eslint-disable comma-dangle */
/* eslint-disable indent */
/* eslint-disable no-var */
/*
 * hebcal calendar HTML client-side rendering
 *
 * requries jQuery and Day.js
 *
 * Copyright (c) 2020  Michael J. Radwin.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or
 * without modification, are permitted provided that the following
 * conditions are met:
 *
 *  - Redistributions of source code must retain the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer.
 *
 *  - Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials
 *    provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND
 * CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
 * INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 * NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

window['hebcal'] = window['hebcal'] || {};

window['hebcal'].getEventClassName = function(evt) {
    var className = evt.category;
    if (evt.yomtov) {
        className += ' yomtov';
    }
    if (typeof evt.link === 'string' &&
        evt.link.substring(0, 4) === 'http' &&
        evt.link.substring(0, 22) !== 'https://www.hebcal.com') {
        className += ' outbound';
    }
    return className;
};

window['hebcal'].transformHebcalEvents = function(events, lang) {
    var evts = events.map(function(src) {
        var allDay = src.date.indexOf('T') == -1,
            title = allDay ? src.title : src.title.substring(0, src.title.indexOf(':')),
            dest = {
                title: title,
                start: dayjs(src.date),
                className: window['hebcal'].getEventClassName(src),
                allDay: allDay
            };
        if (src.memo) {
            dest.description = src.memo;
        }
        if (src.link) {
            dest.url = src.link;
        }
        if (src.hebrew) {
            dest.hebrew = src.hebrew;
            if (lang === 'h') {
                dest.title = src.hebrew;
                dest.className += ' hebrew';
            }
        }
        return dest;
    });
    if (lang === 'ah' || lang === 'sh') {
        var dest = [];
        evts.forEach(function(evt) {
            dest.push(evt);
            if (evt.hebrew) {
                var tmp = $.extend({}, evt, {
                    title: evt.hebrew,
                    className: evt.className + ' hebrew'
                });
                dest.push(tmp);
            }
        });
        evts = dest;
    }
    return evts;
};

window['hebcal'].splitByMonth = function(events) {
    var out = [],
        prevMonth = '',
        monthEvents;
    events.forEach(function(evt) {
        var m = dayjs(evt.date),
            month = m.format('YYYY-MM');
        if (month !== prevMonth) {
            prevMonth = month;
            monthEvents = [];
            out.push({
                month: month,
                events: monthEvents
            });
        }
        monthEvents.push(evt);
    });
    return out;
};

window['hebcal'].hour12cc = {
    US: 1, CA: 1, BR: 1, AU: 1, NZ: 1, DO: 1, PR: 1, GR: 1, IN: 1, KR: 1, NP: 1, ZA: 1,
};

window['hebcal'].tableRow = function(evt) {
    var m = dayjs(evt.date),
        dt = evt.date,
        cat = evt.category,
        dateStr = m.format('ddd DD MMM'),
        allDay = dt.indexOf('T') === -1,
        lang = window['hebcal'].lang || 's',
        subj = evt.title,
        timeStr = '',
        timeTd,
        className = window['hebcal'].getEventClassName(evt);
    if (cat === 'dafyomi') {
        subj = subj.substring(subj.indexOf(':') + 1);
    } else if (cat === 'candles' || cat === 'havdalah') {
        // "Candle lighting: foo" or "Havdalah (42 min): foo"
        subj = subj.substring(0, subj.indexOf(':'));
    }
    if (!allDay) {
        var cc = window['hebcal'].cconfig.cc;
        if (typeof window['hebcal'].hour12cc[cc] === 'undefined') {
            timeStr = dt.substring(11, 16);
        } else {
            var hour = +dt.substring(11, 13);
            var suffix = hour >= 12 ? 'pm' : 'am';
            if (hour > 12) {
                hour = hour - 12;
            }
            var min = dt.substring(14, 16);
            timeStr = String(hour) + ':' + String(min) + suffix;
        }
    }
    timeTd = window['hebcal'].cconfig['geo'] === 'none' ? '' : '<td>' + timeStr + '</td>';
    if (evt.hebrew) {
        var hebrewHtml = '<span lang="he" dir="rtl">' + evt.hebrew + '</span>';
        if (lang == 'h') {
            subj = hebrewHtml;
        } else if (lang.indexOf('h') != -1) {
            subj += ' / ' + hebrewHtml;
        }
    }
    if (evt.link) {
        var atitle = evt.memo ? ' title="' + evt.memo + '"' : '';
        subj = '<a' + atitle + ' href="' + evt.link + '">' + subj + '</a>';
    }
    return '<tr><td>' + dateStr + '</td>' + timeTd + '<td><span class="table-event ' + className + '">' + subj + '</span></td></tr>';
};

window['hebcal'].monthHtml = function(month) {
    var date = month.month + '-01',
        m = dayjs(date),
        divBegin = '<div class="month-table">',
        divEnd = '</div><!-- .month-table -->',
        heading = '<h3>' + m.format('MMMM YYYY') + '</h3>',
        timeColumn = window['hebcal'].cconfig['geo'] === 'none' ? '' : '<col style="width:27px">',
        tableHead = '<table class="table table-striped"><col style="width:116px">' + timeColumn + '<col><tbody>',
        tableFoot = '</tbody></table>',
        tableContents = month.events.map(window['hebcal'].tableRow);
    return divBegin + heading + tableHead + tableContents.join('') + tableFoot + divEnd;
};

window['hebcal'].renderMonthTables = function() {
    if (typeof window['hebcal'].monthTablesRendered === 'undefined') {
        var months = window['hebcal'].splitByMonth(window['hebcal'].events);
        months.forEach(function(month) {
            var html = window['hebcal'].monthHtml(month),
                selector = '#cal-' + month.month + ' .agenda';
            document.querySelectorAll(selector).forEach(function(el) {
                el.innerHTML = html;
            });
        });
        window['hebcal'].monthTablesRendered = true;
    }
};

window['hebcal'].createCityTypeahead = function(autoSubmit) {
    var hebcalCities = new Bloodhound({
        datumTokenizer: Bloodhound.tokenizers.obj.whitespace('value'),
        queryTokenizer: Bloodhound.tokenizers.whitespace,
        remote: '/complete.php?q=%QUERY',
        limit: 8
    });

    hebcalCities.initialize();

    var clearGeo = function() {
        $('#geo').val('none');
        $('#c').val('off');
        $('#geonameid').val('');
        $('#zip').val('');
        $('#city').val('');
    };

    $('#city-typeahead').typeahead(null, {
        name: 'hebcal-city',
        displayKey: 'value',
        source: hebcalCities.ttAdapter(),
        templates: {
            empty: function(ctx) {
                var encodedStr = ctx.query.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
                    return '&#' + i.charCodeAt(0) + ';';
                });
                return '<div class="tt-suggestion">Sorry, no city names match <b>' + encodedStr + '</b>.</div>';
            },
            suggestion: function(ctx) {
                if (typeof ctx.geo === 'string' && ctx.geo == 'zip') {
                    return '<p>' + ctx.asciiname + ', ' + ctx.admin1 + ' <strong>' + ctx.id + '</strong> - United States</p>';
                } else {
                    var ctry = ctx.country && ctx.country == 'United Kingdom' ? 'UK' : ctx.country,
                        ctryStr = ctry || '',
                        s = '<p><strong>' + ctx.asciiname + '</strong>';
                    if (ctry && typeof ctx.admin1 === 'string' && ctx.admin1.length > 0 && ctx.admin1.indexOf(ctx.asciiname) != 0) {
                        ctryStr = ctx.admin1 + ', ' + ctryStr;
                    }
                    if (ctryStr) {
                        ctryStr = ' - <small>' + ctryStr + '</small>';
                    }
                    return s + ctryStr + '</p>';
                }
            }
        }
    }).on('typeahead:selected', function(obj, datum, name) {
        if (typeof datum.geo === 'string' && datum.geo == 'zip') {
            $('#geo').val('zip');
            $('#zip').val(datum.id);
            if (autoSubmit) {
                $('#geonameid').remove();
            } else {
                $('#c').val('on');
                $('#geonameid').val('');
                $('#city').val('');
            }
        } else {
            $('#geo').val('geoname');
            $('#geonameid').val(datum.id);
            if (autoSubmit) {
                $('#zip').remove();
            } else {
                $('#c').val('on');
                $('#zip').val('');
                $('#city').val('');
            }
        }
        if (autoSubmit) {
            $('#shabbat-form').submit();
        }
    }).bind('keyup keypress', function(e) {
        if (!autoSubmit && !$(this).val()) {
            clearGeo();
        }
        // if we get a 5-digit zip, don't require user to select typeahead result
        var val0 = $('#city-typeahead').typeahead('val'),
            val = (typeof val0 === 'string') ? val0.trim() : '',
            numericRe = /^\d+$/;
        if (val.length == 5 && numericRe.test(val)) {
            $('#geo').val('zip');
            $('#zip').val(val);
            if (autoSubmit) {
                $('#geonameid').remove();
            } else {
                $('#c').val('on');
                $('#geonameid').val('');
                $('#city').val('');
            }
        }
        var code = e.keyCode || e.which;
        if (code == 13) {
            if (val.length == 5 && numericRe.test(val)) {
                return true; // allow form to submit
            }
            e.preventDefault();
            return false;
        }
    }).bind('focus', function(e) {
        $(this).typeahead('val', '');
        clearGeo();
});
};
