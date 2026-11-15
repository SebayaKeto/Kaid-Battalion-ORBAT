# Capturing a 360° spin

The capture list (which spins to make, and what to call each one) is in `spin-capture-list.md`.

## One-time setup
1. Run Arma 3 with the unit's modpack, in **windowed or fullscreen 1920×1080 or higher**.
2. Open the **Eden editor** on the **Virtual Reality** map.
3. Place one unit anywhere on open ground. Double-click it and set **Variable Name** to `spin`.
4. Save the scenario (for example as `41st_spin`), so you can reopen it next time.

## For each loadout
1. Right-click the unit and choose **Edit Loadout**. Set up the kit exactly as the billet carries it, then close the Arsenal.
2. Click **Play Scenario**.
3. Press **Esc** to open the **Debug Console**. Paste in the whole of `41st_spin.sqf`.
4. On the line `SPIN_BILLET = "...";`, put the name from the capture list, for example `"medic"`.
5. Press **LOCAL EXEC**. Don't touch the mouse or keyboard. The camera circles the trooper against a pink backdrop and takes 48 screenshots.
6. When **SPIN DONE** shows, press Esc, choose **Back to Editor**, and set up the next loadout.

If the head, feet or antenna are cut off, raise `SPIN_DIST` (for example to `4.8`) and run it again. Running it again overwrites the old shots.

## Where the shots go
`Documents\Arma 3\Screenshots`, or `Documents\Arma 3 - Other Profiles\<your profile>\Screenshots`.

Arma stops saving once that folder passes **250 MB**, which is roughly 3 to 5 spins. When the hint says shots were missed, move the files into a folder such as `F:\41st_Orbat\spin-shots` and carry on.

## Getting them onto the site
Put the screenshots in `F:\41st_Orbat\spin-shots` and tell me in the Codex thread. I'll:
- cut out the backdrop
- crop and shrink the frames (about 0.5 MB per spin)
- add them to the site

Each spin then shows up in the armoury with a 360° / PHOTO switch, and drag-to-turn.
