# Friendsgiving — Google Sheets synchronization

Source workbook: [Friendsgiving Day 2k26](https://docs.google.com/spreadsheets/d/15KhO9_BuCQrJXeTzr4hAyNrqDocAbZsObu_FsWAjGuk/edit)  
Source tab: `Guest List`  
Synced fields: Guest name, Size Shirt, Amount, RSVP, Paid, Paid Via, Shirt Size.

## Current functionality
- The first snapshot was imported into Cloudflare D1 on November 2, 2026.
- The protected endpoint is `POST https://ajd-friendsgiving.pages.dev/api/sheets-sync`.
- The endpoint validates a private token using a SHA-256 hash stored in D1. No secret is stored in GitHub.
- Sheet updates merge field-by-field into the website. Website-only changes are preserved. If both locations change the same cell, the website value is preserved and a conflict is recorded.
- A change to the Google Sheet can be sent by its installable edit trigger; a scheduled trigger checks every five minutes for changes, including updates from forms that might not fire edit triggers.
- Guest records not present in the Sheet are preserved for organizer history, not automatically deleted. **They no longer qualify for teams** after the next successful full Sheet sync, because eligibility uses only current Guest List entries also matched in the Form.
- Team captains, food, and games remain intact. Whenever a guest's RSVP or Paid status changes, the site recomputes eligibility against the latest Google Form responses, adjusts private team drafts, and updates an already-published lineup. Unpublished teams stay hidden.
- Only names present in the form and matching a unique Guest List row with both RSVP and Paid set to Yes are eligible as main participants. Named companions accompany their matched participant; team displays use first names and exclude the specifically nonparticipating companions.
- The organizer **Response Matching** and **Team Assignments** pages share the same eligibility rules and show sync status from both sources.
- The link currently synchronizes **Google Sheets → website**. Website → Google Sheets writeback requires an additional Google-authorized outbound connection and is not yet enabled.

## Activate in Google Sheets (one time)

1. Open the source Google Sheet. Go to **Extensions → Apps Script**.
2. Paste the contents of [friendsgiving-google-sheets.gs](./friendsgiving-google-sheets.gs) into the Apps Script editor and save.
3. Open **Project Settings → Script Properties**. Add property `FRIENDSGIVING_SYNC_TOKEN`, using the private synchronization token configured by the website owner. **Do not add the token to GitHub or the code editor**.
4. Select function `installFriendsgivingSync`, click **Run**, and grant Google permissions to read this Sheet, manage the triggers, and call the Friendsgiving endpoint.
5. Check **Executions** for success. It should run immediately once and install edit and five-minute time-based triggers.
6. Make a non-destructive test update (e.g. alter an RSVP or Paid value and restore it) and verify on the [Squad Planner](https://ajd-friendsgiving.pages.dev/admin/planner).
7. To disable automatic updates, run `stopFriendsgivingSync`.


## Form responses integration

A separate authorized Apps Script installed in the original [HALO FRIENDSGIVING FIELD DAY response sheet](https://docs.google.com/spreadsheets/d/1JRPCoLs2pB44-WyiGvACL0nnDVeiyj_NrgHS8cYrluY/edit) sends the names, Yes/No companion choice, and named companions to `POST /api/form-sync`. See [FORM-RESPONSES.md](./FORM-RESPONSES.md) for installation and data-minimization details. Both scripts are independent; changing code in GitHub does not update the copy saved in Google Apps Script automatically. Keep both scripts' scheduled triggers enabled.

## Data safety

Do not make the Google Sheet publicly accessible to activate this connection. The Apps Script runs as the Google account that authorizes it and sends only the seven guest-list columns, not a public CSV.

**Important:** Existing Friendsgiving organizer pages have no separate admin passcode, as requested. Anyone who has access to those URLs may still modify the planner; consider adding actual admin authentication before enabling website → Sheet writeback.
