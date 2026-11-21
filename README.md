# 41st Orbat

The new roster site. PocketBase runs the database, sign-in and API; the React site in `web/` is built into `pocketbase/pb_public` so everything is served from one address.

What works so far: the public ORBAT view, the staff login portal, and points tracking with the 41st Ops bot.
- Anyone can open the site and view the ORBAT (every platoon, Ranger, Air Wing, Navy and ALL TROOPERS) and the points leaderboard without signing in. Assets will be public too when that page is built. The public view never shows Discord or Steam IDs, and only lists registered troopers.
- Only staff sign in: Unit Leader, Unit Administration and Quartermaster (or any role given a permission under Discord Access). Anyone else who tries is told the site is open to view without an account, and the attempt goes in the Security Log as `denied_not_staff`.
- Username and password sign-in, with first-time setup through Discord.
- Discord sign-in, only for members of the 41st Discord.
- Access from Discord roles (Unit Leader = everything, Unit Administration = points, promotions, transfers and recruitment, Quartermaster = assets; only Unit Leader approves new asset types). Everyone else uses the public view.
- If someone's IP address changes, their session ends and they must type their password. Discord sign-in can't skip this.
- Security log of every sign-in, failed password, IP change and reset. Entries are deleted after 90 days (set `ORBAT_SECURITY_LOG_DAYS` in `.env`; `0` keeps them forever), so IP addresses aren't kept longer than needed.
- Unit Leader pages: Members (with password reset), Security Log, Discord Access (edit role mapping, sync now).
- Roles re-sync from Discord every 2 minutes (needs Server Members Intent). Anyone who leaves the Discord loses access. An open page notices access changes within a minute: removed access applies at once (someone who loses every staff role is signed out and lands on the public view), new access shows a Reload prompt.

## One-time setup (Windows)

1. **PocketBase**: `pocketbase.exe` (0.40.x) goes in the `pocketbase` folder. The website comes pre-built. Install [Node.js LTS](https://nodejs.org) for the 41st Ops bot (and for rebuilding the site).
2. **Discord application** at <https://discord.com/developers/applications>:
   - New Application, named "41st Orbat".
   - **OAuth2**: copy the Client ID and Client Secret. Under Redirects add `http://127.0.0.1:8090/api/oauth2-redirect`, and later your ngrok address with the same ending, for example `https://abcd.ngrok-free.app/api/oauth2-redirect`.
   - **Bot**: Reset Token and copy it. Turn on **Server Members Intent** (and Message Content Intent, needed later for the points bot).
   - **Invite the bot**: OAuth2 > URL Generator, tick `bot`, no permissions needed for sign-in, open the link and add it to the 41st server.
3. Copy `.env.example` to `.env` and paste in the three Discord values. Once they're in `.env`, delete any other file holding the client secret or bot token.
4. In PowerShell from this folder: `.\start-orbat.ps1`. Use `.\start-orbat.ps1 -Build` after changing the site files (needs [Node.js LTS](https://nodejs.org)).
   - If Windows blocks the script: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
5. Open <http://127.0.0.1:8090/_/> once and create the PocketBase superuser (your emergency admin login; keep it private).
6. Open <http://127.0.0.1:8090>, click **Sign in with Discord**, then choose your username and password. Your Unit Leader role gives you full access.

## Points tracking and the 41st Ops bot

- Post a training log in the log channel, or a thread inside it, in the usual format (Instructors, Trainee, Date of Completion, Who is award points, Qualification / Certification Awarded).
- Write people as they appear on Discord, `RANK-1234 "Name"`, no @mentions needed. The bot matches on the four-digit number and the name; rank is ignored. Commas between people are optional. `1234` or `"Name"` alone also work when they're unique.
- **Date of Completion must be a Discord timestamp**, like `<t:1761346800:D>` (everyone sees it in their own date format, so UK and US members can't swap day and month). `today` and `yesterday` also work. Anything typed, like `03/07/2026`, is held: the bot replies with how to fix it, and an admin has to confirm or change the date before approving.
- The bot reacts 📝 and the log appears under **Approvals** on the site, with everyone filled in. If the number and name point at different people, or a name fits more than one person, or nobody matches, it's flagged so you can pick the right member or add them to the roster.
- Approve it and each ticked person gets **1 point**; the bot swaps 📝 for ✅. Deny it and nobody gets points; the bot adds ❌.
- Editing the Discord post while it's still pending updates the site. Deleting it removes it. Once reviewed, it's locked.
- **Correcting a reviewed log (Unit Leader only by default):** open it under HISTORY. **EDIT** puts it back in the queue to change and review again; its points come off until it's approved again. **RETRACT** (with a reason) takes back any points it gave, but the log stays on record as *retracted* with its full history. Nothing is ever deleted. A pending log can also be retracted from the queue, which drops it without a Discord denial thread. This is the **Edit & retract logs** permission in Discord access; only the Unit Leader role has it to start with.
- **+ LOG EVENT** on Approvals records an Operation (or any event) by hand until the Arma 3 watcher is built.
- **Points** shows everyone's total and this week's points; click a name for their history. Admins can add manual adjustments (for example a recruitment bounty) with a reason.
- People mentioned in a log who aren't on the roster yet are added automatically and marked NEW.
- The bot also reports role changes the moment they happen, so site access updates instantly. The 2-minute sync stays as a backup.

**Bot setup:** install [Node.js LTS](https://nodejs.org). `start-orbat.ps1` creates the shared `ORBAT_BOT_SECRET` in `.env`, installs the bot the first time, and opens it in its own window. The bot needs Server Members Intent and Message Content Intent turned on, and View Channel, Read Message History, Send Messages, Send Messages in Threads, Create Private Threads and Add Reactions in the log channel, plus View Channel and Send Messages in the audit channel (invite permission integer 343597452352). Use `.\start-orbat.ps1 -NoBot` to run the site without it.

**Audit trail:** every log keeps a timestamped history on the site: when it was logged, every edit to the Discord post (with before and after text), every change an admin made, and who approved or denied it. Approvals has three views: QUEUE (pending), HISTORY (every approved, denied, withdrawn or retracted log) and SITE LOG (everything, searchable). Approvals, denials, post edits or deletions after review, and manual adjustments are also posted by the bot in the channel set as `ORBAT_AUDIT_CHANNEL`.

**Denials:** a reason is required. The bot opens a private thread in the log channel with the reason and a link to the log. Only the person who logged it, the admin who denied it, and members with Unit Administration or Unit Leader are in it (change the roles with `ORBAT_DENIAL_ROLES`). Only the logger and the admin are pinged. If the bot can't make a private thread, it never posts the reason publicly instead.

**Edits after review** change nothing on the site. The bot replies once to say so, and each edit is saved in the history. A pending log whose post is deleted, or edited so it's no longer a log, is marked withdrawn rather than deleted; editing it back reopens it.

To watch more channels, set `ORBAT_LOG_CHANNELS` in `.env`, for example `1563587741445267527:training,123456789012345678:operation`.

## Campaigns and the points calendar

- **Campaigns:** the Points leaderboard shows the current campaign in full. **PREVIOUS CAMPAIGNS** opens earlier ones, each with its own leaderboard. Staff with points access press **START NEW CAMPAIGN** with a name and start date: the current campaign ends the day before, and points earned from the start date count towards the new one. The first campaign is called "Current Campaign" and covers everything before that; rename it with **RENAME CURRENT**. The ORBAT shows all-time points.
- **How points were earned:** every point is a **billeted op** (an operation hosted by their own platoon, or with no host platoon set), a **fill-in op** (an operation hosted by another platoon), **training**, or **other** (manual adjustments and starting points). Set **Host platoon** when reviewing an operation so this comes out right. It uses the trooper's platoon at the time the log is approved.
- **Calendar:** the CALENDAR view shows every registered trooper from last week to 6 weeks ahead, with the points they earned each week split by type. It is grouped Battalion Command, Company Command, Acklay, Banshee, Chimaera, Drexl, Rangers, Air Wing, Navy, then Unassigned. Command, Ranger, Air Wing and Navy groups come from the trooper's ORBAT slot; the rest from their platoon.

## Orbat and registration

The ORBAT tab shows each unit as in Mock v2: Katarn (Acklay, Chimaera), Tusken (Banshee, Drexl), and Special Units (Ranger, Air Wing, Navy). Line platoon pages show Battalion Command, their Company Command and their own Platoon Command, then the squads and the Armour Section, then Recruit Holding, Unassigned, Active and Inactive Reserves. Ranger is a restricted compartment with its four squads and the Gundark Scout Team.

- Staff with transfers, recruitment or full access press **+ ASSIGN** on a vacant slot to place a trooper. Picking someone already in a slot moves them. Clicking a trooper opens their card, with **REMOVE FROM SLOT** and **EDIT DETAILS**. Every placement is logged and posted in the audit feed.
- **COMMAND** (first in the ORBAT menu) holds Battalion Command and the Katarn and Tusken company commands, above platoon level. Their unit is Battalion Command, Katarn Company or Tusken Company rather than a platoon: pick it as the Unit when registering, or place them in a command slot. They still appear at the top of every platoon page they oversee. On operations, Battalion Command always earns billeted points, and company command earns billeted points on their two platoons' ops.
- A trooper holds one slot at a time. Placing them in a line platoon, Air Wing or Navy slot sets their platoon, and the slot's billet becomes theirs. Moving someone to a reserve status or discharging them frees their slot.
- **Reordering slots:** in **EDIT LAYOUT**, drag a slot by its ⠿ handle to a new place in its section, or use the ▲ ▼ arrows (handy on a phone). Troopers stay in their slots.
- **Squad logos:** in **EDIT LAYOUT** press **+ LOGO** on a squad and pick an image (PNG, JPG, WEBP or GIF, up to 5 MB). It shows to the right of the squad title, always at the same size whatever size the image is. **CHANGE LOGO** and **REMOVE** do what they say. A full-size copy of every logo is also saved in `pocketbase\squad_logos\` (named like `acklay--alpha-squad.png`), so it goes along when you copy the site folder. If a squad ever has no logo but its copy is in that folder (say, on a fresh database), the site puts it back when it starts.
- **Fireteam colours:** in **EDIT LAYOUT** each slot has a colour (Red, Yellow, Green, Blue or No colour), so two Medic slots on different fireteams can be told apart. The colour shows on the slot and in every dropdown, and the trooper's billet reads e.g. "Medic (Blue)".
- **TRANSFER** (on ALL TROOPERS and on a trooper's card) moves someone to any vacant slot in any unit, or into a unit's holding. It needs the Transfers permission (Unit Administration and Unit Leader). **EDIT** for changing their details is separate.
- Unit Leaders can press **EDIT LAYOUT** to rename sections and billets, add or delete slots and sections, and set Ranger callsigns. Filled slots can't be deleted.

**ALL TROOPERS** lists every registered trooper by platoon, with rank, number, callsign, status, billet, join date and points. People with Unit Administration (recruitment) or Unit Leader can press **+ REGISTER TROOPER**:

- Pick their Unit, then **Billet** lists that unit's vacant slots grouped by squad (or section). Picking one places them in that slot as soon as they're registered. Leave it on "No slot yet" to put them in holding, or pick "Other" to type a billet.
- Search the Discord member list to link their account; rank, number and callsign fill in from a `RANK-1234 "Name"` nickname.
- Starting points default to 0. Anything above 0 needs a reason and goes in the points ledger and the audit log. Untick "Count towards this week's and the current campaign's totals" for points carried over from before (ticked by default): they then count only in the all-time total shown on the ORBAT, and stay out of the weekly, campaign and calendar totals.
- Numbers and callsigns can't be re-used, even from a discharged trooper. The form flags one that's taken as you type and won't register or save until it's changed. Troopers who already shared one from before are marked SHARED in the list, with a note at the top, so one of each pair can be given their own.
- People added automatically from training logs appear under **Awaiting registration**. Registering them keeps the points they've already earned.
- **EDIT** uses the same Billet dropdown: it starts on their current slot, and picking another vacant slot moves them there, "No slot" puts them in holding, and "Other" frees the slot and keeps a typed billet.
- Registered troopers can only be changed with **EDIT** on the Orbat page, and every registration and edit is logged (Site log and the Discord audit feed).

## Trooper profiles

**TROOPERS** (open to everyone) has a profile for every registered trooper: rank, unit, billet and join date, the seven qualifications (lit when held), certifications, a points summary (this campaign and place, all time, how they were earned, the last 8 weeks, last attended) and the service record (registration, promotions, moves, qualifications and certifications). Callsigns in ALL TROOPERS and the OPEN PROFILE button on a slot open it too. Nothing private is shown.

- **From a training log:** when a log is approved, its Qualification field picks the qualification or certification (staff can change it or pick "Nothing to award"), and the trainees are ticked to receive it.
- **GENTAC** gives Rifleman (RFL) and promotes each ticked CR to CT automatically. Anyone above CR keeps their rank.
- **Zeus** (Apprentice, Journeyman, Expert, Master) and **SULC** (Fireteam Leadership, then Squad Leadership) are one certification each, with steps. A trooper holds one step; moving up shows in the service record.
- **By hand:** Unit Administration (recruitment) can ADD QUALIFICATION or ADD CERTIFICATION on a profile, for training run before the site, or REVOKE / WITHDRAW one. A revoked one just stops showing, and adding it again brings it back. An optional note goes only in the staff Site Log.
- Retracting or reopening a log takes its qualifications back off. A CT promotion it made stays.
- Certifications don't expire. Medals and awards come later.

## Assets

The ASSETS tab shows what Battalion Command, the four line platoons and Ranger hold in each campaign: vehicles, weapons and supplies. Anyone can view it. Air Wing and Navy aren't tracked; Air Wing flies the platoons' vehicles.

- **Overview:** totals, run-out and below-zero alerts, and the matrix of asset types by unit with this week's change. EXPORT CSV downloads it. On a phone it shows one unit at a time.
- **Unit view:** the unit's assets as cards, a weekly gains-and-losses chart, and WHAT CHANGED. Hover or tap a bar to see which assets that week's gains or losses were.
- **Log:** every entry with its reason, operation and who logged it. Retracted entries stay, struck through, with the reason.
- **Quartermaster tools** (the Assets permission): LOG CHANGES (several lines at once; a count below zero asks "Log anyway?"), retract an entry with a reason, ASSET TYPES (submit new types, rename, set images, pick which units hold each, retire or restore) and STARTING SUPPLY (presets, and how the current campaign starts: a preset, carried over from the last campaign, or zero). Campaigns themselves are still started on the Points page.
- **New asset types** wait as pending until someone with Approve asset types (the Unit Leader only) approves or denies them.
- **Images** are shown at 128×128. The original is also copied to `pocketbase\asset_images\`, and put back on start-up if the database lost it.
- **Discord:** every change on the Assets page is posted by the bot in the channel set as `ORBAT_ASSETS_CHANNEL` in `.env`. Leave it empty to turn that feed off.

## On your phone (same network)

Start with `.\start-orbat.ps1 -Lan`. It prints an address like `http://192.168.1.20:8090`; open that on a phone or PC on the same Wi-Fi. Allow PocketBase on **Private networks** if Windows asks about the firewall. Staff sign in there with their username and password (Discord sign-in only works on the PC's own address unless that address is added to the Discord OAuth2 redirects). Without `-Lan` the site is only reachable on this PC.

## Security

- Visitors can only read. Every change goes through the site's own checks for the right permission, and is written to the Site Log or Security Log.
- Accounts are only made by Discord sign-in, nobody can give themselves permissions, and staff sign-in re-checks Discord roles. Password sign-in is limited to 8 tries a minute.
- The PocketBase admin dashboard (`/_/`) has full control, so it only opens on this PC. From a phone or through ngrok it's refused. Give the superuser a long password used nowhere else.
- Anyone who can use this PC can open `pocketbase\pb_data` (the database) and `.env` (the Discord secrets) directly. Keep the PC account locked, and never share those two.
- Take backups from the admin dashboard: Settings > Backups (it can run on a schedule).

## Sharing with ngrok

`ngrok http 8090`, then add `<ngrok address>/api/oauth2-redirect` to the Discord OAuth2 redirects. The free ngrok address changes each time it restarts, so the redirect needs updating each time (a free static ngrok domain avoids this).

## Good to know

- **Strict IP mode** asks for the password again whenever someone's IP changes: moving between Wi-Fi and mobile data, a VPN, or using two devices on different networks. If this is too frequent, set `ORBAT_IP_MODE=subnet` in `.env`.
- **The bot token matters.** Without it the site can't check Discord membership or roles: new Discord sign-ins are refused and roles can't be re-checked. Keep it set.
- **Forgotten password**: a Unit Leader uses Members > Reset Password; the member then signs in with Discord and sets a new one.
- Back up `pocketbase/pb_data` regularly; it is the whole database.

## Development

`cd web && npm install && npm run dev` serves the site at <http://127.0.0.1:5173> with live reload, using the PocketBase on port 8090.

## Landing page (unit portal)

The site opens on the unit portal. `#orbat` opens the ORBAT app, and the ORBAT header has a "‹ PORTAL" button back.

To add another section to the portal, add an entry to `web/src/portal.js` (title, short description, where it goes, and `status: "live"` or `"soon"`), then rebuild with `.\start-orbat.ps1 -Build`. The grid makes room by itself.

Titles on the portal use the Aurebesh font from github.com/vinorodrigues/font-aurebesh (SIL Open Font License, see `web/src/assets/fonts/Aurebesh-LICENSE.md`).
