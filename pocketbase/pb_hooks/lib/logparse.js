// Reads a training log post in the 41st format:
//
//   Instructors: @A @B
//   Trainee: @C
//   Date of Completion: 24/10/2026
//   Who is award points: @A @B @C
//   Qualification / Certification Awarded: CLS
//
// Labels can be in any order, bold (**Label:**), and values can run onto the
// next lines. People are Discord mentions (<@123>) or plain names.
// Pure function: shared by the PocketBase hooks and the tests.

const FIELDS = [
  ["instructors", /^instructors?$/],
  ["trainees", /^trainees?$/],
  ["date", /^(date of completion|completion date|date)$/],
  ["points", /^(who is award(ed)? points|who is awarded points|who gets points|points awarded to|awarded points|points)$/],
  ["qualification", /^(qualification\s*\/\s*certification awarded|certification\s*\/\s*qualification awarded|qualification awarded|certification awarded|qualification|certification|qual\s*\/\s*cert)$/],
];


function cleanLabel(s) {
  return s.replace(/[*_~`>|]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function fieldFor(label) {
  const l = cleanLabel(label);
  for (let i = 0; i < FIELDS.length; i++) if (FIELDS[i][1].test(l)) return FIELDS[i][0];
  return "";
}

// RANK-1234 "Name": rank optional, any quote style
const FULL_NAME = /(?:\b[A-Za-z]{1,8}\.?\s*[-–]?\s*)?\b\d{4}\b\s*["“”'‘’]\s*[^"“”'‘’\n,]{1,40}?\s*["“”'‘’]/g;
const QUOTES = /["“”'‘’]/;

// The parts that identify someone: the four-digit number and the name in
// quotes (or the words after the number). Rank is ignored.
//   CPL-7567 "Rex" -> { number: "7567", name: "rex" }
//   7567           -> { number: "7567", name: "" }
//   Rex            -> { number: "", name: "rex" }
function identity(text) {
  const t = String(text || "").trim();
  const num = t.match(/(?:^|[^0-9])(\d{4})(?![0-9])/);
  const quoted = t.match(/["“”'‘’]\s*([^"“”'‘’]+?)\s*["“”'‘’]/);
  let name = "";
  if (quoted) name = quoted[1];
  else if (num) name = t.slice(t.indexOf(num[1]) + 4).replace(/^[\s\-–|:.]+/, "");
  else name = t;
  name = name.replace(/[^A-Za-z0-9\u00C0-\u024F' \-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return { number: num ? num[1] : "", name };
}

// "<@1>, <@!2> and Bob" -> { ids: ["1","2"], names: ["Bob"] }
function people(text) {
  const ids = [];
  const re = /<@!?(\d{1,25})>/g;
  let m;
  while ((m = re.exec(text))) if (ids.indexOf(m[1]) === -1) ids.push(m[1]);
  let rest = text.replace(/<@!?\d+>/g, ",").replace(/<@&\d+>|<#\d+>/g, ",");
  const names = [];
  // pull out 41st-style names first (CPL-7567 "Rex"), so they work even without commas
  rest = rest.replace(FULL_NAME, (whole) => {
    const n = whole.replace(/\s+/g, " ").trim();
    if (names.map((x) => x.toLowerCase()).indexOf(n.toLowerCase()) === -1) names.push(n.slice(0, 100));
    return ",";
  });
  rest.split(/[,\n;&+]|\band\b|\s\/\s/i).forEach((part) => {
    // drop bullets and formatting, keep hyphens inside names (CT-7567)
    const n = part.replace(/^[\s*_~`>|•\-–.]+/, "").replace(/[*~`|]/g, "").replace(/^_+|_+$/g, "").replace(/^\s*@/, "").replace(/\s+/g, " ").trim();
    if (!n || /^(n\/?a|none|nil|-+|tbc|tba)$/i.test(n)) return;
    if (names.map((x) => x.toLowerCase()).indexOf(n.toLowerCase()) === -1) names.push(n.slice(0, 100));
  });
  return { ids, names };
}

// UK calendar date (YYYY-MM-DD) for a moment in time. British Summer Time runs
// from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October.
function lastSunday(year, month) { // month 0-based
  const d = new Date(Date.UTC(year, month + 1, 0, 1));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}
function ukDate(ms) {
  const y = new Date(ms).getUTCFullYear();
  const bst = ms >= lastSunday(y, 2) && ms < lastSunday(y, 9);
  return new Date(ms + (bst ? 3600000 : 0)).toISOString().slice(0, 10);
}

// Dates must be unambiguous: a Discord timestamp (<t:1761350400:D>, which
// everyone sees in their own format), or "today" / "yesterday".
// Typed dates like 03/07/2026 are refused, because UK and US readers swap
// day and month. Returns { date: "YYYY-MM-DD", how } or { date: "", how: "missing" | "typed" }.
function parseDate(text, postedAt) {
  const t = String(text || "").replace(/[*_~`]/g, "").trim();
  const posted = postedAt ? new Date(postedAt).getTime() : Date.now();
  const stamp = t.match(/<t:(-?\d{1,12})(?::[tTdDfFR])?>/);
  if (stamp) return { date: ukDate(Number(stamp[1]) * 1000), how: "timestamp" };
  if (/^today\b/i.test(t)) return { date: ukDate(posted), how: "today" };
  if (/^yesterday\b/i.test(t)) return { date: ukDate(posted - 86400000), how: "yesterday" };
  return { date: "", how: t ? "typed" : "missing" };
}

// Returns null when the post isn't a log (fewer than two known labels).
function parseLog(content, postedAt) {
  const values = {};
  let current = "";
  let found = 0;
  String(content || "").split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*(?:[*_>\-•]+\s*)*([A-Za-z][A-Za-z \/*_]{1,60}?)\s*\**\s*[:\-–]\s*\**(.*)$/);
    const field = m ? fieldFor(m[1]) : "";
    if (field) {
      if (values[field] === undefined) found++;
      current = field;
      values[field] = (values[field] ? values[field] + "\n" : "") + m[2];
    } else if (current && line.trim()) {
      values[current] += "\n" + line;
    }
  });
  if (found < 2) return null;

  const notes = [];
  const instructors = people(values.instructors || "");
  const trainees = people(values.trainees || "");
  let awarded = people(values.points || "");
  // "all of the above" / "everyone" = every instructor and trainee
  if (!awarded.ids.length && awarded.names.length === 1 && /^(all|everyone|everybody|all of (the )?above|all above|all (attendees|present|listed))\.?$/i.test(awarded.names[0])) {
    awarded = {
      ids: instructors.ids.concat(trainees.ids.filter((i) => instructors.ids.indexOf(i) === -1)),
      names: instructors.names.concat(trainees.names.filter((n) => instructors.names.indexOf(n) === -1)),
    };
  }
  const when = parseDate(values.date || "", postedAt);
  let date = when.date;
  let dateNeedsCheck = false;
  if (!date) {
    date = ukDate(postedAt ? new Date(postedAt).getTime() : Date.now());
    dateNeedsCheck = true;
    notes.push(when.how === "typed"
      ? `The date "${values.date.trim().slice(0, 40)}" was typed, so it could be read the wrong way round (UK vs US). The post date was used. Check it and confirm before approving.`
      : "No date given, so the post date was used. Check it and confirm before approving.");
  }
  if (!awarded.ids.length && !awarded.names.length) {
    notes.push("Nobody is listed under \"Who is award points\". Tick who gets a point before approving.");
  }
  const qualification = (values.qualification || "").replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
  return { date, dateNeedsCheck, instructors, trainees, awarded, qualification: /^(n\/?a|none|-+)$/i.test(qualification) ? "" : qualification, notes };
}

module.exports = { parseLog, parseDate, ukDate, people, identity };
