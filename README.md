# סלט · THE GROUP GAMES

חידון קזינו על ההיסטוריה של החבורה. לשחק: https://elipoli100.github.io/the-group-games/

## קוד המקור
התיקייה `game/` היא המקור. `python3 game/build.py` אורז הכול לקובץ אחד (`game/dist/index.html`), וזה הקובץ שמועתק ל-`index.html` כאן.
בדיקות: `python3 game/probe_solo.py game/dist/index.html` (משחק מלא) ו-`python3 game/probe_casino.py game/dist/index.html` (כל משחקי הקזינו).
`game/engine.js` הוא המנוע והכלכלה; `game/engine.sha256` שומר שהוא לא השתנה.
`python3 game/probe_pose.py game/dist/index.html` מצלם כל מסך פעמיים בשלושה גדלים ובודק שהצילומים זהים, שיש לכל היותר כפתור אדום אחד והדגשת זהב אחת, ושאין גלילה לרוחב.
במשחק עצמו: פותחים את האתר עם `?dev=2828`, ובקונסול `__TGG_APP.pose('reveal')` (או gate, home, claim, countdown, question, casino, break-sum, final, share). `__TGG_APP.pose(null)` מחזיר למשחק הרגיל.
