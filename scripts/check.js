#!/usr/bin/env node
// Contrôles automatiques du dépôt « Ma boîte à histoires » (Node, sans dépendance).
// Usage : node scripts/check.js [--base <réf git>] [--racine <dossier>]
//   --base    réf de la branche cible (ex. origin/main) : APP_VERSION doit lui être strictement supérieure.
//             Sans --base, ce contrôle est ignoré (utile en local sur main).
//   --racine  dossier du site à contrôler (par défaut : le dépôt qui contient ce script).
// Code de sortie : 0 si tout est bon, 1 si au moins un contrôle échoue.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const HEROS_ATTENDUS = 38;
const HISTOIRES_ATTENDUES = 228;

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const RACINE = path.resolve(opt("--racine") || path.join(__dirname, ".."));
const BASE = opt("--base");

const erreurs = [];
const echec = m => erreurs.push(m);
const info = m => console.log("  · " + m);
const section = t => console.log("\n" + t);
const chemin = (...p) => path.join(RACINE, ...p);
const lire = f => fs.readFileSync(chemin(f), "utf8");
const existe = f => { try { return fs.statSync(chemin(f)).size > 0; } catch (e) { return false; } };
const apercu = (arr, n = 5) => arr.slice(0, n).join(", ") + (arr.length > n ? ` … (+${arr.length - n})` : "");

let html = "", sw = "";
try { html = lire("index.html"); } catch (e) { echec("index.html introuvable ou illisible."); }
try { sw = lire("sw.js"); } catch (e) { echec("sw.js introuvable ou illisible."); }

// ---------- 1. Syntaxe JavaScript ----------
section("1. Syntaxe JavaScript");
function verifSyntaxe(nom, code) {
  try { new vm.Script(code, { filename: nom }); return true; }
  catch (e) { echec(`Erreur de syntaxe dans ${nom} : ${e.message}`); return false; }
}
if (html) {
  const re = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0, ok = 0;
  while ((m = re.exec(html))) {
    if (/type\s*=\s*["']?(?!text\/javascript|module)/i.test(m[1])) continue; // ex. JSON-LD
    n++;
    const ligne = html.slice(0, m.index).split("\n").length;
    if (verifSyntaxe(`index.html (script ligne ${ligne})`, m[2])) ok++;
  }
  if (n === 0) echec("Aucun script en ligne trouvé dans index.html.");
  else info(`index.html : ${ok}/${n} script(s) en ligne valide(s)`);
}
if (sw && verifSyntaxe("sw.js", sw)) info("sw.js : syntaxe valide");

// ---------- Extraction des données de l'appli (sans exécuter l'appli) ----------
function extraire(nom, fin) {
  const debut = html.indexOf(`\nconst ${nom}=`);
  if (debut < 0) { echec(`« const ${nom}= » introuvable dans index.html.`); return undefined; }
  const depart = debut + 1 + `const ${nom}=`.length;
  const finIdx = html.indexOf(fin, depart);
  if (finIdx < 0) { echec(`Fin de « ${nom} » introuvable dans index.html.`); return undefined; }
  try { return vm.runInNewContext("(" + html.slice(depart, finIdx + fin.length - 1) + ")", {}, { timeout: 5000 }); }
  catch (e) { echec(`Impossible de lire « ${nom} » : ${e.message}`); return undefined; }
}
const CHARS = html ? extraire("CHARS", "\n];") : undefined;
const RAW = html ? extraire("RAW", "\n];") : undefined;
const BUILTIN = html ? extraire("BUILTIN", "\n};") : undefined;
const AUDIO = html ? extraire("AUDIO", "]);") : undefined; // Set sur une seule ligne
const ILLUS = html ? extraire("ILLUS", "]);") : undefined;
const HEROPIC = html ? extraire("HEROPIC", "]);") : undefined;

// ---------- 2. Contenu attendu ----------
section("2. Héros et histoires attendus");
if (CHARS && RAW) {
  if (CHARS.length !== HEROS_ATTENDUS) echec(`${CHARS.length} héros trouvés, ${HEROS_ATTENDUS} attendus.`);
  else info(`${CHARS.length} héros`);
  if (RAW.length !== HISTOIRES_ATTENDUES) echec(`${RAW.length} histoires trouvées, ${HISTOIRES_ATTENDUES} attendues.`);
  else info(`${RAW.length} histoires`);
  const ids = new Set(CHARS.map(c => c.id));
  if (ids.size !== CHARS.length) echec("Des identifiants de héros sont en double.");
  const inconnus = [...new Set(RAW.map(r => r[0]).filter(c => !ids.has(c)))];
  if (inconnus.length) echec(`Histoires rattachées à un héros inexistant : ${apercu(inconnus)}.`);
  const sansHistoire = CHARS.filter(c => !RAW.some(r => r[0] === c.id)).map(c => c.id);
  if (sansHistoire.length) echec(`Héros sans aucune histoire : ${apercu(sansHistoire)}.`);
  const titres = RAW.map(r => r[2]);
  const doublons = titres.filter((t, i) => titres.indexOf(t) !== i);
  if (doublons.length) echec(`Titres d'histoires en double : ${apercu([...new Set(doublons)])}.`);
  const vides = RAW.map((r, i) => (!r[2] || !r[3] || !(r[1] > 0) ? "b" + i : null)).filter(Boolean);
  if (vides.length) echec(`Histoires au titre, résumé ou durée manquant : ${apercu(vides)}.`);
}

// ---------- 3. Histoires, voix, illustrations, portraits ----------
section("3. Histoires, voix et illustrations");
if (RAW && BUILTIN && AUDIO && ILLUS) {
  const attendus = RAW.map((_, i) => "b" + i);
  const manquants = attendus.filter(id => !(typeof BUILTIN[id] === "string" && BUILTIN[id].trim().length > 50));
  if (manquants.length) echec(`Histoires sans texte dans BUILTIN : ${apercu(manquants)}.`);
  const orphelins = Object.keys(BUILTIN).filter(id => !attendus.includes(id));
  if (orphelins.length) echec(`Textes BUILTIN sans histoire correspondante : ${apercu(orphelins)}.`);

  const audioHorsListe = [...AUDIO].filter(id => !attendus.includes(id));
  if (audioHorsListe.length) echec(`AUDIO cite des histoires inconnues : ${apercu(audioHorsListe)}.`);
  const mp3Manquants = [...AUDIO].filter(id => !existe(`audio/${id}.mp3`));
  if (mp3Manquants.length) echec(`AUDIO cite des MP3 absents ou vides : ${apercu(mp3Manquants)}.`);

  const illusHorsListe = [...ILLUS].filter(id => !attendus.includes(id));
  if (illusHorsListe.length) echec(`ILLUS cite des histoires inconnues : ${apercu(illusHorsListe)}.`);
  const imgManquantes = [...ILLUS].filter(id => !existe(`illus/${id}.webp`));
  if (imgManquantes.length) echec(`ILLUS cite des illustrations absentes ou vides : ${apercu(imgManquantes)}.`);

  // Fichiers publiés mais non déclarés : l'appli ne les utiliserait pas
  const listeDossier = (d, ext) => { try { return fs.readdirSync(chemin(d)).filter(f => f.endsWith(ext)).map(f => f.slice(0, -ext.length)); } catch (e) { return []; } };
  const mp3NonDeclares = listeDossier("audio", ".mp3").filter(id => !AUDIO.has(id));
  if (mp3NonDeclares.length) echec(`MP3 présents mais absents de AUDIO (jamais joués) : ${apercu(mp3NonDeclares)}.`);
  const imgNonDeclarees = listeDossier("illus", ".webp").filter(id => !ILLUS.has(id));
  if (imgNonDeclarees.length) echec(`Illustrations présentes mais absentes de ILLUS : ${apercu(imgNonDeclarees)}.`);

  const enPreparation = attendus.filter(id => !AUDIO.has(id));
  info(`${AUDIO.size} voix publiées, ${enPreparation.length} « voix en préparation »`);
  info(`${ILLUS.size} illustrations publiées`);
}
if (CHARS && HEROPIC) {
  const ids = new Set(CHARS.map(c => c.id));
  const hors = [...HEROPIC].filter(id => !ids.has(id));
  if (hors.length) echec(`HEROPIC cite des héros inconnus : ${apercu(hors)}.`);
  const absents = [...HEROPIC].filter(id => !existe(`heros/${id}.webp`));
  if (absents.length) echec(`Portraits de héros absents ou vides : ${apercu(absents)}.`);
  else info(`${HEROPIC.size} portraits de héros présents`);
}

// ---------- 4. Service worker ----------
section("4. Service worker (liste REFRESH)");
if (sw) {
  const m = /const REFRESH\s*=\s*(\[[^\]]*\])/.exec(sw);
  if (!m) echec("Liste REFRESH introuvable dans sw.js.");
  else {
    let liste;
    try { liste = vm.runInNewContext(m[1], {}, { timeout: 1000 }); } catch (e) { echec("Liste REFRESH illisible : " + e.message); }
    if (liste) {
      if (!Array.isArray(liste) || liste.some(f => typeof f !== "string")) echec("REFRESH doit être une liste de chaînes.");
      else {
        const mauvais = liste.filter(f => !/^(audio|illus)\/[\w.-]+$/.test(f));
        if (mauvais.length) echec(`REFRESH : chemins invalides (attendu audio/… ou illus/…) : ${apercu(mauvais)}.`);
        const absents = liste.filter(f => !mauvais.includes(f) && !existe(f));
        if (absents.length) echec(`REFRESH cite des fichiers absents : ${apercu(absents)}.`);
        const dup = liste.filter((f, i) => liste.indexOf(f) !== i);
        if (dup.length) echec(`REFRESH contient des doublons : ${apercu(dup)}.`);
        info(`REFRESH : ${liste.length} fichier(s)`);
      }
    }
  }
  const mc = /c\.addAll\((\[[^\]]*\])\)/.exec(sw);
  if (mc) {
    try {
      const coque = vm.runInNewContext(mc[1], {}, { timeout: 1000 });
      const absents = coque.filter(f => f !== "./" && !existe(f));
      if (absents.length) echec(`Fichiers de la coque du service worker absents : ${apercu(absents)}.`);
      else info(`Coque du service worker : ${coque.length} fichier(s) présents`);
    } catch (e) { echec("Liste de précache du service worker illisible : " + e.message); }
  }
}

// ---------- 5. Version ----------
section("5. Version (APP_VERSION)");
const versionDe = src => { const m = /const APP_VERSION\s*=\s*["'](\d+)["']/.exec(src || ""); return m ? Number(m[1]) : null; };
const version = versionDe(html);
if (version === null) echec("APP_VERSION introuvable (ou non numérique) dans index.html.");
else if (!BASE) info(`APP_VERSION = ${version} (comparaison à la branche cible ignorée : pas de --base)`);
else {
  let ref = null;
  try { ref = execFileSync("git", ["show", `${BASE}:index.html`], { cwd: RACINE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { echec(`Impossible de lire index.html sur « ${BASE} » (git fetch fait ?).`); }
  if (ref !== null) {
    const vBase = versionDe(ref);
    if (vBase === null) echec(`APP_VERSION introuvable sur « ${BASE} ».`);
    else if (version <= vBase) echec(`APP_VERSION (${version}) doit être supérieure à celle de ${BASE} (${vBase}) : incrémente-la.`);
    else info(`APP_VERSION ${version} > ${vBase} (${BASE})`);
  }
}

// ---------- 6. Secrets ----------
section("6. Recherche de secrets");
const MOTIFS = [
  ["clé API de type sk-…", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["jeton GitHub", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ["clé AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["clé Google", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["jeton Slack", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["clé privée", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["jeton Bearer", /\bBearer\s+[A-Za-z0-9._~+\/-]{30,}/],
  ["affectation de secret", /\b(?:api[_-]?key|secret|token|passw(?:or)?d|mot_?de_?passe)["']?\s*[:=]\s*["'][A-Za-z0-9_\-\/+=.]{16,}["']/i],
];
const EXT = new Set([".html", ".js", ".json", ".txt", ".md", ".yml", ".yaml", ".webmanifest", ".svg", ".css", ".xml"]);
function* fichiers(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || (e.name.startsWith(".") && e.name !== ".github")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* fichiers(p);
    else if (e.isFile() && EXT.has(path.extname(e.name).toLowerCase())) yield p;
  }
}
let nbFichiers = 0, nbSecrets = 0;
for (const f of fichiers(RACINE)) {
  nbFichiers++;
  const lignes = fs.readFileSync(f, "utf8").split("\n");
  lignes.forEach((l, i) => {
    for (const [nom, re] of MOTIFS) {
      if (re.test(l)) { nbSecrets++; echec(`Secret possible (${nom}) : ${path.relative(RACINE, f)}, ligne ${i + 1} (valeur masquée).`); }
    }
  });
}
if (!nbSecrets) info(`${nbFichiers} fichiers texte analysés, aucun secret détecté`);

// ---------- Bilan ----------
console.log("");
if (erreurs.length) {
  console.log(`ÉCHEC : ${erreurs.length} problème(s) :`);
  erreurs.forEach(e => console.log("  ✗ " + e));
  if (process.env.GITHUB_ACTIONS) erreurs.forEach(e => console.log(`::error::${e}`));
  process.exit(1);
}
console.log("OK : tous les contrôles sont passés.");
