# Languages

Rental_Control is available in **English (en)**, **Kinyarwanda (rw)** and **French (fr)**.

## How it works

- `react-i18next` with five namespaces per language in `frontend/src/locales/<lang>/`: `common`, `properties`, `maintenance`, `inspections`, `finances`.
- Code uses keys only, always with the namespace: `t("maintenance:report.submit")`. Plurals use `_one` / `_other`; variables use `{{name}}`.
- The language selector is on every page (public header, landlord top bar, tenant header, settings). Changing it updates all text immediately, saves the choice to the account (`User.language`) and to the browser for visitors who are not signed in. Default: English.
- Server errors carry a `code`; the frontend shows `common:errors.<code>` / `common:validation.<code>`, so messages appear in the chosen language.
- Notifications are stored as `kind` + `params` and turned into a sentence on the reader's screen, so the same notification reads correctly in any language.
- Dates, numbers and money use `Intl` with Kigali time. Browsers have no Kinyarwanda date data, so Kinyarwanda dates use our own month names (`common:dates.months`) and "… ago" phrases (`common:dates.*`).
- Fallback language is English: a missing key shows English rather than a raw key.

## Checking coverage

```bash
cd frontend
npm run i18n:check
```

The script fails if a key used in the code is missing in English, if French or Kinyarwanda is missing a key or has an extra one, or if a translation uses different `{{variables}}`. The same check runs inside `npm test`.

## Review status — please read

| Language | Status |
|---|---|
| English | Source text |
| French | Complete. Drafted with care in plain, professional French; a review by a native speaker is still recommended. |
| **Kinyarwanda** | **Complete, but not yet reviewed by a native speaker. A review is required before production use.** |

Kinyarwanda was written in short, conversational phrases, avoiding literal word-for-word translation. The terms we are least sure about are listed in `frontend/src/locales/review.json` under `needsNativeReview` (31 keys), including:

- the core nouns chosen for *property* (“umutungo”), *unit* (“inzu ikodeshwa”), *inspection* (“isuzuma ry'inzu”), *expenses* (“amafaranga yasohotse”) and *net cash flow* (“amafaranga asigaye”);
- room and building words (*bathroom/toilet*, *corridor*, *compound*, *flooring*, *fixtures*);
- the condition label *Needs attention* (“Bikeneye kwitabwaho”) and priority *Can wait*;
- the longer privacy and finance explanation texts.

No strings are currently left in English on purpose (`englishFallback` is empty). If a reviewer finds a string that cannot be translated well yet, add its key to `englishFallback` (format `rw:namespace:key`) and remove it from the Kinyarwanda file: the app will show English and the check will allow it.

## Adding a language

1. Copy `src/locales/en` to `src/locales/<code>` and translate the values.
2. Import the five files in `src/i18n/index.ts` and add the code to `LANGUAGES` and `supportedLngs`.
3. Add the code to `LANGUAGES` in `scripts/check-translations.mjs` and to `User.Language` in `backend/apps/accounts/models.py` (then `makemigrations`).
4. If browsers lack date data for that language, leave its `LOCALES` entry empty in `src/lib/format.ts` to use the translated month names.
5. Run `npm run i18n:check`.

Layouts already allow for longer labels (buttons wrap, navigation labels are not truncated, tables become stacked cards on phones).
