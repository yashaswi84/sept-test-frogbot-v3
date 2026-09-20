const express = require("express");
const _ = require("lodash");
const moment = require("moment");
const Handlebars = require("handlebars");

// DEMO plants (scanned by Frogbot; not required for the HTTP routes below)
require("./demo-plants/fake-secrets");
require("./demo-plants/oss-snippet");

// Contextual Analysis contrast (M3):
// APPLICABLE — lodash / moment / handlebars are called on request paths below.
// NOT APPLICABLE — `axios` and `minimist` are declared in package.json but never required
// or invoked here, so related CVEs should show as not applicable (or equivalent).

const app = express();

// lodash 4.17.4 — CVE-2019-10744 (prototype pollution via merge) — APPLICABLE
app.get("/merge", (req, res) => {
  const result = _.merge({}, JSON.parse(req.query.data || "{}"));
  res.json(result);
});

// lodash 4.17.4 — CVE-2021-23337 (command injection via template) — APPLICABLE
app.get("/", (req, res) => {
  res.send(_.template("Hello <%= name %>")({ name: req.query.name || "Frogbot" }));
});

// moment 2.18.1 — CVE-2017-18214 (ReDoS via crafted date string) — APPLICABLE
app.get("/date", (req, res) => {
  res.send(moment(req.query.d).format("LLLL"));
});

// handlebars 4.0.11 — CVE-2019-19919 / CVE-2021-23369 — APPLICABLE
app.get("/render", (req, res) => {
  const template = Handlebars.compile(req.query.tpl || "Hello {{name}}");
  res.send(template({ name: "world" }));
});

app.listen(3000, () => console.log("listening on :3000"));
