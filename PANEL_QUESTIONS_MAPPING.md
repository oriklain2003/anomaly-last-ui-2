# Dashboard Panel to Questions Mapping

This document maps each dashboard panel to the specific questions it answers from `docs/demands_3.txt`.

---

## Overview Tab (`OverviewTab.tsx`)

### StatCards Row 1

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Total Flights** | כמה מטוסים עוברים מעל ישראל ביום?/בשבוע?/בחודש? | How many planes pass over Israel per day/week/month? | L1 |
| **Anomaly Flights** | כמה מטוסים לא טסו על פי נתיב מוגדר? | How many planes did not fly according to a defined route? | L1 |
| **Safety Events** | כמה אירועי בטיחות (התקרבויות מתחת ל2000 רגל ו5 מייל) היו מעל ישראל/מעל ירדן? | How many safety events (approaches below 2000 feet and 5 miles) were over Israel/Jordan? | L1 |
| **Go-Arounds** | כמה מטוסים ביטלו נחיתה ברגע האחרון? | How many planes aborted landing at the last minute? | L1 |

### StatCards Row 2

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Emergency Codes** | כמה מטוסים החליפו לקוד מצוקה ומה קרה להם? | How many planes switched to a distress code and what happened to them? | L1 |
| **Near-Miss Events** | מדד "כמעט ונפגע" – התקרבויות בין מטוסים לפי דרגות חומרה ואזורי עניין | Near-miss index - approaches between planes by severity and areas of interest | L2 |
| **Return-To-Field** | כמה מטוסים המריאו, שהו פחות מ30 דקות באוויר וחזרו לנחיתה באותו בסיס? | How many planes took off, stayed less than 30 min and returned to same base? | L1 |
| **Unplanned Landing** | כמה מטוסים המריאו וחזרו לנחיתה ישר לאחר המראה (בניגוד למתוכנן) | How many planes took off and returned immediately after takeoff (contrary to plan)? | L1 |

### Charts

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Flights Per Day** | כמה מטוסים עוברים מעל ישראל ביום? | How many planes pass over Israel per day? | L1 |
| **Monthly Flight Aggregation** | באיזה חודש טסו הכי הרבה מטוסים בשמיים? | Which month had the most planes flying in the sky? | L1 |
| **Airspace Risk Score** | מה הסיכוי לתאונה במשמרת הזו? | What is the chance of an accident in this shift? | L4 |

---

## Safety Tab (`SafetyTab.tsx`)

### Overview Cards

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Emergency Codes** | כמה מטוסים החליפו לקוד מצוקה ומה קרה להם? | How many planes switched to a distress code? | L1 |
| **Near-Miss Events** | מדד "כמעט ונפגע" – התקרבויות בין מטוסים | Near-miss index - approaches between planes | L2 |
| **Go-Arounds** | כמה מטוסים ביטלו נחיתה ברגע האחרון? | How many planes aborted landing at the last minute? | L1 |
| **Most Dangerous Month** | איזה חודש היה הכי מסוכן מבחינה בטיחותית? | Which month was the most dangerous in terms of safety? | L2 |

### Analysis Panels

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Safety Events by Month** | איזה חודש היה הכי מסוכן מבחינה בטיחותית? | Which month was the most dangerous in terms of safety? | L2 |
| **Events by Flight Phase** | כמה אירועי בטיחות קרו בגובה שיוט לעומת כמה בגישה לנחיתה? | How many safety events at cruise altitude vs approach to landing? | L2 |
| **Airline Safety Scorecard** | איזה חברת תעופה הכריזה הכי הרבה על מצב חירום או שינוי קוד? | Which airline declared the most emergencies or code changes? | L2 |
| **Emergency Code Aftermath** | כמה מטוסים החליפו לקוד מצוקה ומה קרה להם (מה המטוס ביצע לאחר מכן)? | How many planes switched to distress code and what did they do afterwards? | L2 |
| **Emergency Incident Clusters** | האם היו כמה אירועים ביום אחד? האם היו באותו האזור? | Were there several incidents in one day? Were they in the same area? | L2 |
| **Near-Miss by Country** | כמה אירועי בטיחות היו מעל ישראל/מעל ירדן? | How many safety events were over Israel/Jordan? | L1 |
| **Near-Miss Geographic Map** | איפה קורים הכי הרבה אירועי בטיחות? | Where do most safety events occur? | L2 |
| **Diversion Analysis** | כמה מטוסים לא הגיעו ליעדם המקורי? / כמה ביצעו מעקפים גדולים? | How many planes did not reach original destination? / Made large detours? | L1/L2 |
| **Return to Base Events** | כמה מטוסים המריאו ושהו פחות מ30 דקות וחזרו? | How many planes took off, stayed <30 min and returned? | L1 |
| **Go-Arounds by Time of Day** | באיזה שעות ביום יש הכי הרבה הליכות סביב? | At what hours are there the most go-arounds? | L2 |
| **High Incident Days** | האם היו כמה אירועים ביום אחד? | Were there several incidents in one day? | L2 |

---

## Traffic Tab (`TrafficTab.tsx`)

### Overview Cards

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Total Flights** | כמה מטוסים עוברים מעל ישראל ביום?/בשבוע?/בחודש? | How many planes pass over Israel per day/week/month? | L1 |
| **Avg Flights/Day** | כמה מטוסים עוברים מעל ישראל ביום? | How many planes pass over Israel per day? | L1 |
| **Military Flights** | כמה מטוסים צבאיים טסים בשמי המזרח התיכון? | How many military planes fly in Middle East skies? | L1 |
| **Signal Loss Events** | איפה רמת קליטת האות של מטוס יורדת? | Where does the signal reception level drop? | L2 |

### Traffic Analysis

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Flights with Missing Info** | כמה מטוסים טסים בלי אות קריאה? / כמה בלי יעד מוגדר? | How many fly without call sign? / without defined destination? | L1 |
| **Airspace Bottleneck Zones** | באיזה איזורים יש צווארי בקבוק? | In which areas are there bottlenecks? | L2 |
| **Flight Traffic Over Time** | באיזה חודש טסו הכי הרבה? / באיזה שעה ביום הכי עמוס? | Which month had most flights? / What time of day is busiest? | L1 |
| **Busiest Airports** | על איזה מסלול בנתב"ג נוחתים הכי הרבה? | On which runway at Ben Gurion do most planes land? | L1 |
| **Signal Loss Zone Details** | איפה רמת קליטת האות של מטוס יורדת? | Where does signal reception drop? | L2 |
| **Monthly Signal Loss Events** | יש חודש מסוים שהיו יותר איבודי קליטה? | Was there a specific month with more signal losses? | L2 |
| **Signal Loss by Hour** | באיזה שעות ביום יש הכי הרבה הפרעות? | At what hours are there most interferences? | L2 |
| **Peak Hours Analysis** | באיזה שעה ביום הכי עמוס בשמיים? / בנתב"ג? | What time of day is busiest in the sky? / at Ben Gurion? | L1 |
| **Traffic vs Safety by Hour** | מתי הכי מסוכן בשמיים בטיחותית? | When is it most dangerous in the sky? | L2 |
| **Route Deviations by Aircraft** | כמה מטוסים לא טסו על פי נתיב מוגדר? / איזה סוגים? | How many didn't follow route? / Which types? | L1 |
| **Monthly Diversion Trends** | באיזה תקופה בשנה יש הכי הרבה המתנות? | What time of year has most holdings? | L2 |
| **Seasonal Diversion Analysis** | באיזה תקופה בשנה יש הכי הרבה המתנות? | What time of year has most holdings? | L2 |
| **Runway Usage** | על איזה מסלול טיסה בנתב"ג נוחתים הכי הרבה? | On which runway at Ben Gurion do most planes land? | L1 |
| **Airport Hourly Traffic** | באיזה שעה ביום הכי עמוס בנתב"ג? | What time of day is busiest at Ben Gurion? | L1 |
| **Unusual Signal Loss Alert** | איפה ומתי היו אזורים שלפתע חוו איבודי קליטה למרות שבדרך כלל יש להם קליטה? | Where/when areas suddenly experienced signal loss despite usually having reception? | L3 |

---

## Intelligence Tab (`IntelligenceTab.tsx`)

### Operational Intelligence

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Holding Pattern Analysis** | כמה מטוסים ביצעו המתנות באוויר של 360 לפני נחיתה? / באיזה שדה תעופה מבצעים הכי הרבה המתנות? | How many performed 360 holdings before landing? / Which airport has most holdings? | L1/L2 |
| **Airline Efficiency Comparison** | למה חברה A טסה בממוצע 15 דקות יותר מחברה B? / מי החברת טיסה הכי יעילה? | Why does company A fly 15 min longer than B? / Who is most efficient airline? | L2 |
| **Airline Activity Trends** | האם זיהינו מגמות של חברות טיסות שונות? (חברה שהפסיקה לטוס מעל ישראל?) | Did we identify trends of different airlines? (airline that stopped flying over Israel?) | L3 |
| **Weather Impact Analysis** | כמה מטוסים סטו מנתיב הטיסה שלהם עקב סופת "ביירון" / מז"א בתאריך X | How many deviated due to "Byron" storm / weather on date X? | L2 |
| **Seasonal Trends** | אפקט "יום כיפור" / חגים - השינוי הדרסטי בתבנית הטיסות בימים מיוחדים | Yom Kippur effect / holidays - drastic change in flight patterns on special days | L3 |
| **Special Events Impact** | זיהוי דפוסי תנועה חריגים סביב חגים/אירועים מיוחדים | Detect unusual traffic patterns around holidays/special events | L3 |
| **Alternate Airport Behavior** | כשנתב"ג נסגר בגלל ירי, לאן כולם בורחים? | When Ben Gurion closes due to shooting, where do planes flee? | L2 |
| **Pressure Hours Analysis** | מתי הכי מסוכן בשמיים בטיחותית? | When is it most dangerous in the sky? | L2 |

### GPS Jamming Intelligence (WOW Feature)

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **GPS Jamming Heatmap** | לבדוק איפה היו הפרעות קליטה בזמן טיסת המטוסים – אזורים חשודים / תמפה לי את כלל האזורים שיש להם הפרעות GPS | Check where there were reception interferences - suspicious areas / Map all GPS interference areas | L2/L3 |
| **GPS Jamming Temporal** | באיזה שעות ביום יש הכי הרבה הפרעות? | At what hours of the day are there most interferences? | L2 |
| **GPS Jamming Clusters** | איפה יש הפרעות GPS בצורה מתמידה? | Where are there constant GPS interferences? | L3 |
| **Jamming Source Triangulation** | זיהוי מיקום מקורות השיבוש על בסיס שילוש מטיסות מושפעות | Identify jamming source locations based on triangulation from affected flights | L3 (WOW) |

### Military Intelligence

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Military Activity Patterns** | נוכחות צבאית זרה - מעקב אחר פעילויות זרות, ומה ניתן להסיק מכך | Foreign military presence - tracking foreign activities | L3 |
| **Military Routes** | מה הנתיב המועדף על מטוסי תדלוק אמריקאיים | What is the preferred route for American refueling planes? | L3 |
| **Military by Country** | איזה מדינה זרה טסה הכי הרבה טיסות צבאיות באזורינו / כמה מטוסים בריטיים צבאיים חצו החודש | Which foreign country flies most military flights? / How many British military crossed this month? | L2 |
| **Bilateral Proximity Detection** | האם היו התקרבויות בין מטוסים רוסים לאמריקאיים? | Were there approaches between Russian and American planes? | L3 |
| **Military by Destination** | כמה טיסות צבאיות נחתנו בסוריה שהגיעו ממדינות ממזרח? | How many military flights landed in Syria from eastern countries? | L3 |

### Deep Intelligence

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Route Efficiency Comparison** | למה חברה A טסה בממוצע 15 דקות יותר מחברה B? | Why does company A fly 15 min longer than B? | L2 |
| **Combined Threat Assessment** | הערכת איום משולבת מכל מקורות המודיעין | Combined threat assessment from all intelligence sources | L4 (WOW) |
| **Anomaly DNA** | טביעת אצבע דיגיטלית - המטוס הזה עשה בדיוק את אותו סיבוב לפני שבוע (איסוף מודיעין שיטתי) | Digital fingerprint - This plane made the exact same turn a week ago (systematic intelligence gathering) | L3 (WOW) |
| **Signal Loss Zones (5+ Min Gaps)** | איפה רמת קליטת האות של מטוס יורדת? | Where does signal reception drop? | L2 |

---

## Predict Tab (`PredictTab.tsx`)

### Predictive Analytics (Level 4)

| Panel | Question (Hebrew) | Question (English) | Level |
|-------|-------------------|-------------------|-------|
| **Real-Time Airspace Risk** | מה הסיכוי לתאונה במשמרת הזו? | What is the chance of an accident in this shift? | L4 |
| **Safety Event Forecast** | מה הסיכוי לתאונה במשמרת הזו? | What is the chance of an accident in this shift? | L4 |
| **Trajectory Prediction & Border Analysis** | האם המטוס הזה עומד לעשות משהו חשוד? | Is this plane about to do something suspicious? | L4 |
| **Hostile Intent Analysis** | האם השינוי הקטן הזה הוא תחילתה של תקיפה? | Is this small change the beginning of an attack? | L4 |

---

## Level Definitions (from demands_3.txt)

- **L1 (Level 1)**: Superficial/Numerical - Basic counts and statistics
- **L2 (Level 2)**: Operational Insights/Trends - Pattern recognition and trend analysis  
- **L3 (Level 3)**: Deep Operational Intelligence - Advanced correlation and intelligence
- **L4 (Level 4)**: Prediction/Prevention - Predictive analytics and early warning

---

## WOW Features (Advanced Intelligence)

These panels provide unique intelligence capabilities:

1. **Anomaly DNA** - Identifies systematic intelligence gathering by tracking repeated unusual patterns
2. **Jamming Source Triangulation** - Estimates GPS jamming source locations from affected flights
3. **Combined Threat Assessment** - Aggregates all threat indicators into unified risk score
4. **Hostile Intent Analysis** - Predicts potential hostile actions before they occur
5. **Bilateral Proximity Detection** - Monitors military interactions between competing nations

