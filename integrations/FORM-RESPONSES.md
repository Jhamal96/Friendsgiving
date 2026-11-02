# Halo Friendsgiving — Form Responses connection

Source: [HALO FRIENDSGIVING FIELD DAY 🏆 (Responses)](https://docs.google.com/spreadsheets/d/1JRPCoLs2pB44-WyiGvACL0nnDVeiyj_NrgHS8cYrluY/edit?usp=drivesdk)  
Tab: `Form Responses 1`  
Admin review: https://ajd-friendsgiving.pages.dev/admin/responses

The original uploaded 23 response rows were imported into Cloudflare D1 as a **privacy-limited snapshot**. One respondent submitted twice, so matching is performed against unique normalized names. The script does not create guests or change RSVP/payment fields. Matching prefers exact name, first name + last initial, and a unique first name. Uncertain names remain for review.

Only these fields are copied to the website: source row, respondent name, T-shirt size, structured plus-one name and shirt size, whether children will attend, and a 1–5 athletic self-rating. No phone, email, allergy/dietary notes, or additional free-text plus-one details are copied. These remain in the original response sheet.

The public Friendsgiving page is intentionally unaffected. The review and connection UI are only linked from organizer pages. **However, the existing organizer pages are not protected by login, and the original response spreadsheet currently has an "anyone with the link: writer" sharing permission.** You should restrict that permission and add organizer authentication before displaying sensitive form data on this website.

## Enable automatic response updates (one-time setup)

1. Open the linked **Responses** spreadsheet while signed in as an editor who is allowed to manage Apps Script triggers. Go to **Extensions → Apps Script**.
2. Copy the [Forms integration script](./friendsgiving-form-responses.gs) into that Apps Script project and save.
3. In **Project Settings → Script Properties**, create property `FIELD_DAY_SYNC_TOKEN` and set its value to the private token provided to the organizer. Never paste it in the code, spreadsheet cells, or GitHub.
4. Select `installFieldDayResponseSync` and click **Run**. Grant the necessary Google permissions.
5. The setup installs a form-submit trigger and a five-minute refresh. Check **Executions** for any authorization errors.
6. Open the admin [Response Matching](https://ajd-friendsgiving.pages.dev/admin/responses) page and click **Refresh matches**. In the admin gear Settings button, click **Check connection**.
7. To stop the integration, execute `stopFieldDayResponseSync` in Apps Script.

**Important:** The Google spreadsheet integration is *one-way* (Responses → Cloudflare admin). The original form does not overwrite guest payment records, RSVP confirmation, team assignments, or the main public event page. Uncertain and duplicate names are not automatically merged.
