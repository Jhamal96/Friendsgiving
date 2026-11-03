# Halo Friendsgiving — Form Responses connection

Source: [HALO FRIENDSGIVING FIELD DAY 🏆 (Responses)](https://docs.google.com/spreadsheets/d/1JRPCoLs2pB44-WyiGvACL0nnDVeiyj_NrgHS8cYrluY/edit?usp=drivesdk)  
Tab: `Form Responses 1`  
Admin review: https://ajd-friendsgiving.pages.dev/admin/responses

The original uploaded 23 response rows were imported into Cloudflare D1 as a **privacy-limited snapshot**. One respondent submitted twice, so matching is performed against unique normalized names. The script does not create guest/payment rows or change RSVP/payment fields. All team eligibility is checked against the separate Guest List, using exact name, unique first-and-last initial, then unique first-name matching. A participant must have both RSVP and Paid marked Yes. Uncertain or unpaid names remain for review; team captain assignments are preserved.

Only required registration fields are copied to Cloudflare D1: source row, respondent name, T-shirt size, the Yes/No plus-one answer, named companion details (including the separate additional-plus-one field), whether children will attend, and a 1–5 athletic self-rating. Phone, email, and allergy/dietary notes are not copied. The organizer review page exposes only short matching aliases, counts, row numbers, and sync status—not the raw additional-companion text or contact details.

The public Friendsgiving page shows a guest's team and captain only after that guest enters a matching name, and only while the organizer has the teams published. The review and connection UI are only linked from organizer pages. **However, the existing organizer pages are not protected by login, and the original response spreadsheet currently has an "anyone with the link: writer" sharing permission.** You should restrict that permission and add organizer authentication before displaying sensitive form data on this website.

## Enable automatic response updates (one-time setup)

1. Open the linked **Responses** spreadsheet while signed in as an editor who is allowed to manage Apps Script triggers. Go to **Extensions → Apps Script**.
2. Copy the [Forms integration script](./friendsgiving-form-responses.gs) into that Apps Script project and save.
3. In **Project Settings → Script Properties**, create property `FIELD_DAY_SYNC_TOKEN` and set its value to the private token provided to the organizer. Never paste it in the code, spreadsheet cells, or GitHub.
4. Select `installFieldDayResponseSync` and click **Run**. Grant the necessary Google permissions.
5. The setup installs a form-submit trigger and a five-minute refresh. Check **Executions** for any authorization errors.
6. Open the admin [Response Matching](https://ajd-friendsgiving.pages.dev/admin/responses) page and click **Refresh matches**. In the admin gear Settings button, click **Check connection**.
7. To stop the integration, execute `stopFieldDayResponseSync` in Apps Script.

**Important:** The Google spreadsheet integration is *one-way* (Responses → Cloudflare admin). The original form never overwrites Guest List payment/RSVP values. When both feeds update the website, the shared eligibility matcher adds/removes qualifying people in team drafts and balances already published teams, while honoring the organizer's Unpublish choice. Uncertain and duplicate names are never automatically merged.

## Keep both lists working together

- The original [Guest List](https://docs.google.com/spreadsheets/d/15KhO9_BuCQrJXeTzr4hAyNrqDocAbZsObu_FsWAjGuk/edit) supplies the payment and RSVP decisions. The [Form responses](https://docs.google.com/spreadsheets/d/1JRPCoLs2pB44-WyiGvACL0nnDVeiyj_NrgHS8cYrluY/edit) supply registered names and named companions.
- Two private Google Apps Script triggers independently send updates to the protected Cloudflare endpoints, typically every five minutes. The team matching logic is the same for the Response Review and Team Manager pages.
- To include **new entries from the Additional plus one column I**, update the installed Form Apps Script with the current [friendsgiving-form-responses.gs](./friendsgiving-form-responses.gs) and save it. The code stored in GitHub does **not** automatically update an already-installed Google Apps Script project.
- The site's **Recheck synced data** button checks the most recently received cloud records; it cannot force Google to send new edits immediately.
- Sync remains **one-way into Friendsgiving**. Changes saved in the Friendsgiving website do not automatically write back into either Google Sheet.
