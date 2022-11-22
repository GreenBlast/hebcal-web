#!/bin/sh

set -x

TMPFILE=`mktemp /tmp/hebcal.XXXXXX`
YEAR0=`date +'%Y'`
YEAR=`expr ${YEAR0} - 1`
ENDY2=`expr ${YEAR} + 2`
END2="${ENDY2}-12-31"
ENDY3=`expr ${YEAR} + 3`
END3="${ENDY3}-12-31"
ENDY5=`expr ${YEAR} + 5`
END5="${ENDY5}-12-31"
ENDY8=`expr ${YEAR} + 8`
END8="${ENDY8}-12-31"
ENDY10=`expr ${YEAR} + 10`
END10="${ENDY10}-12-31"
START="${YEAR}-12-01"
DOWNLOAD_URL="http://127.0.0.1:8080"

remove_file() {
    file=$1
    rm -f "${file}.ics" "${file}.csv" "${file}.ics.br" "${file}.csv.br" "${file}.ics.gz" "${file}.csv.gz"
}

fetch_urls () {
    file=$1
    args=$2
    remove_file $file
    curl -o $TMPFILE "${DOWNLOAD_URL}/export/${file}.ics?${args}" && cp $TMPFILE "${file}.ics"
    curl -o $TMPFILE "${DOWNLOAD_URL}/export/${file}.csv?${args}" && cp $TMPFILE "${file}.csv"
    chmod 0644 "${file}.ics" "${file}.csv"
}

compress_file() {
    file=$1
    nice brotli --keep --best "${file}.ics" "${file}.csv"
    nice gzip --keep --best "${file}.ics" "${file}.csv"
}

FILE="jewish-holidays-v2"
fetch_urls $FILE "start=${START}&end=${END10}&v=1&maj=on&min=off&mod=off&i=off&lg=en&c=off&geo=none&nx=off&mf=off&ss=off&emoji=1&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Jewish+Holidays+%E2%9C%A1%EF%B8%8F&caldesc=Major+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="jewish-holidays-all-v2"
fetch_urls $FILE "start=${START}&end=${END8}&v=1&maj=on&min=on&mod=on&i=off&lg=en&c=off&geo=none&nx=on&mf=on&ss=on&emoji=1&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Jewish+Holidays+%E2%9C%A1%EF%B8%8F&caldesc=All+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="jewish-holidays"
fetch_urls $FILE "start=${START}&end=${END10}&v=1&maj=on&min=off&mod=off&i=off&lg=en&c=off&geo=none&nx=off&mf=off&ss=off&emoji=0&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Jewish+Holidays&caldesc=Major+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="jewish-holidays-all"
fetch_urls $FILE "start=${START}&end=${END8}&v=1&maj=on&min=on&mod=on&i=off&lg=en&c=off&geo=none&nx=on&mf=on&ss=on&emoji=0&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Jewish+Holidays&caldesc=All+Jewish+holidays+for+the+Diaspora+from+Hebcal.com"
compress_file $FILE

FILE="hdate-en"
fetch_urls $FILE "start=${START}&end=${END2}&v=1&i=off&lg=en&d=on&c=off&geo=none&publishedTTL=PT30D&title=Hebrew+calendar+dates+%28en%29&caldesc=Displays+the+Hebrew+date+every+day+of+the+week+in+English+transliteration&color=%23AC8E68"
compress_file $FILE

FILE="hdate-he"
fetch_urls $FILE "start=${START}&end=${END2}&v=1&i=off&lg=h&d=on&c=off&geo=none&publishedTTL=PT30D&title=Hebrew+calendar+dates+%28he%29&caldesc=Displays+the+Hebrew+date+every+day+of+the+week+in+Hebrew&color=%23AC8E68"
compress_file $FILE

FILE="hdate-he-v2"
fetch_urls $FILE "start=${START}&end=${END2}&v=1&i=off&lg=he-x-NoNikud&d=on&c=off&geo=none&publishedTTL=PT30D&title=Hebrew+calendar+dates+%28he%29&caldesc=Displays+the+Hebrew+date+every+day+of+the+week+in+Hebrew&color=%23AC8E68"
compress_file $FILE

FILE="omer"
fetch_urls $FILE "start=${START}&end=${END3}&v=1&o=on&i=off&lg=en&c=off&geo=none&emoji=0&publishedTTL=PT30D&title=Days+of+the+Omer&caldesc=7+weeks+from+the+second+night+of+Pesach+to+the+day+before+Shavuot&color=%23FF9F0A"
compress_file $FILE

FILE="torah-readings-diaspora"
fetch_urls $FILE "start=${START}&end=${END5}&v=1&s=on&i=off&lg=en&c=off&geo=none&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Torah+Readings+%28Diaspora%29&caldesc=Parashat+ha-Shavua+-+Weekly+Torah+Portion+from+Hebcal.com&color=%23257E4A"
compress_file $FILE

FILE="torah-readings-israel"
fetch_urls $FILE "start=${START}&end=${END5}&v=1&s=on&i=on&lg=en&c=off&geo=none&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Torah+Readings+%28Israel+English%29&caldesc=Parashat+ha-Shavua+-+Weekly+Torah+Portion+from+Hebcal.com&color=%23257E4A"
compress_file $FILE

FILE="torah-readings-israel-he"
fetch_urls $FILE "start=${START}&end=${END5}&v=1&s=on&i=on&lg=h&c=off&geo=none&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Torah+Readings+%28Israel+Hebrew%29&caldesc=Parashat+ha-Shavua+-+Weekly+Torah+Portion+from+Hebcal.com&color=%23257E4A"
compress_file $FILE

FILE="daf-yomi"
fetch_urls $FILE "start=${START}&end=${END5}&v=1&F=on&i=off&lg=en&c=off&geo=none&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Daf+Yomi&caldesc=Daily+regimen+of+learning+the+Babylonian+Talmud&color=%23BF5AF2"
compress_file $FILE

FILE="mishna-yomi"
fetch_urls $FILE "start=${START}&end=${END5}&v=1&myomi=on&i=off&lg=en&c=off&geo=none&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Mishna+Yomi&caldesc=Daily+study+of+the+Mishna&color=%23003399"
compress_file $FILE

FILE="yerushalmi-vilna"
fetch_urls $FILE "start=${START}&end=${END5}&v=1&yyomi=on&i=off&lg=en&c=off&geo=none&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Yerushalmi+Yomi&caldesc=Daily+regimen+of+learning+the+Jerusalem+Talmud&color=%23BF5AF2"
compress_file $FILE

FILE="yom-kippur-katan"
fetch_urls $FILE "start=${START}&end=${END10}&v=1&ykk=on&relcalid=457ce561-311f-4eeb-9033-65561b7f7503&lg=en&utm_source=ical&utm_medium=icalendar&utm_campaign=ical-${FILE}&publishedTTL=PT30D&title=Yom+Kippur+Katan&caldesc=%D7%99%D7%95%D6%B9%D7%9D+%D7%9B%D6%BC%D6%B4%D7%A4%D6%BC%D7%95%D6%BC%D7%A8+%D7%A7%D6%B8%D7%98%D6%B8%D7%9F%2C+minor+day+of+atonement+on+the+day+preceeding+each+Rosh+Chodesh"
compress_file $FILE

FILE="kindness"
remove_file $FILE
node dist/kindness.js
compress_file $FILE

rm -f $TMPFILE
