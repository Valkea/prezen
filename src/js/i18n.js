/* PrezEn · i18n: interface languages. Strings are written in English in the code and looked up in a dictionary
 * per language (missing entries fall back to English). The chosen language is remembered:
 *   - in this browser (localStorage "prezen:lang"), for the online app and for files opened in it,
 *   - inside every exported file (pz-data "lang"), so a file opened elsewhere keeps the language it was saved with.
 * Order: explicit choice in this browser > language stored in the file > browser language > English.
 * This file holds the strings of the slideshow player (part of the light export); editor strings live in editor/lang-fr.js. */
(function (PZ) {
  'use strict';

  PZ.LANGS = { en: 'English', fr: 'Français' };
  PZ.lang = 'en';
  const KEY = 'prezen:lang';
  const dicts = { en: {} };

  PZ.addStrings = function (lang, map) { dicts[lang] = Object.assign(dicts[lang] || {}, map); };
  PZ.strings = (lang) => dicts[lang] || {};

  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s);
  /** Translate an English string. {name} placeholders are filled from vars. */
  PZ.t = function (s, vars) {
    const d = dicts[PZ.lang];
    return fill((d && Object.prototype.hasOwnProperty.call(d, s) && d[s]) || s, vars);
  };
  /** Plural: PZ.tn('{n} slide', '{n} slides', n). French uses the singular for 0 and 1. */
  PZ.tn = function (one, other, n, vars) {
    const single = PZ.lang === 'fr' ? Math.abs(n) < 2 : n === 1;
    return PZ.t(single ? one : other, Object.assign({ n: n.toLocaleString(PZ.lang) }, vars));
  };

  /** 'fr-CA' → 'fr' when supported, else null. */
  PZ.validLang = function (l) {
    const c = typeof l === 'string' ? l.slice(0, 2).toLowerCase() : '';
    return Object.prototype.hasOwnProperty.call(PZ.LANGS, c) ? c : null;
  };
  PZ.savedLang = function () { try { return PZ.validLang(localStorage.getItem(KEY)); } catch (e) { return null; } };

  function apply(l) {
    PZ.lang = l;
    if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = l;
  }

  /** Pick the language at startup. fileLang: the language stored in the opened file, if any. */
  PZ.initLang = function (fileLang) {
    const nav = typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) : [];
    apply(PZ.savedLang() || PZ.validLang(fileLang) || nav.map(PZ.validLang).find(Boolean) || 'en');
    return PZ.lang;
  };

  /** Switch language and remember it in this browser. Returns true when it could be stored here. */
  PZ.setLang = function (l) {
    apply(PZ.validLang(l) || 'en');
    let stored = false;
    try { localStorage.setItem(KEY, PZ.lang); stored = localStorage.getItem(KEY) === PZ.lang; } catch (e) { /* private mode, some file:// setups */ }
    try { document.dispatchEvent(new CustomEvent('pz-lang', { detail: PZ.lang })); } catch (e) { /* no DOM */ }
    return stored;
  };

  // ---------------------------------------------------------------- French: player, print, boot, shared modules
  PZ.addStrings('fr', {
    'Language': 'Langue',
    'Close': 'Fermer',
    // player
    'Previous (←)': 'Précédente (←)',
    'Next (→, space)': 'Suivante (→, espace)',
    'Overview (O)': 'Vue d’ensemble (O)',
    'Presenter view (S)': 'Mode présentateur (S)',
    'Full screen (F)': 'Plein écran (F)',
    'Print / save as PDF (P)': 'Imprimer / enregistrer en PDF (P)',
    'Exit (Esc)': 'Quitter (Échap)',
    'End of the presentation': 'Fin de la présentation',
    'The browser blocked the presenter window: allow pop-ups for this page.': 'Le navigateur a bloqué la fenêtre du présentateur : autorisez les fenêtres pop-up pour cette page.',
    'Presenter view': 'Mode présentateur',
    '◀ Prev': '◀ Préc.',
    'Next ▶': 'Suiv. ▶',
    'Pause timer': 'Pause chrono',
    'Resume': 'Reprendre',
    'Current': 'Actuelle',
    'Next': 'Suivante',
    'Notes': 'Notes',
    'End of presentation': 'Fin de la présentation',
    'No notes for this slide.': 'Pas de notes pour cette diapositive.',
    'Slide {n} / {total}': 'Diapositive {n} / {total}',
    // print
    'Preparing PDF… In the print dialog choose “Save as PDF”.': 'Préparation du PDF… Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF ».',
    // render
    'Double-click to add a picture': 'Double-cliquez pour ajouter une image',
    'Image not found: {ref}': 'Image introuvable : {ref}',
    // boot
    'The presentation inside this file is damaged: {msg}': 'La présentation contenue dans ce fichier est endommagée : {msg}',
    'No presentation found in this file.': 'Aucune présentation trouvée dans ce fichier.',
    'This link is damaged or incomplete ({msg}).': 'Ce lien est endommagé ou incomplet ({msg}).',
    'Opened from a link. It is now saved in this browser (My presentations).': 'Ouverte depuis un lien. Elle est maintenant enregistrée dans ce navigateur (Mes présentations).',
    '{mod}+S saves your changes back into a file (pick this same file to replace it).': '{mod}+S enregistre vos modifications dans un fichier (choisissez ce même fichier pour le remplacer).',
    // model, codec, assets
    'Untitled presentation': 'Présentation sans titre',
    'Not a presentation': 'Ce n’est pas une présentation',
    'Unsupported presentation version': 'Version de présentation non prise en charge',
    'This browser cannot open compressed links': 'Ce navigateur ne peut pas ouvrir les liens compressés',
    'Unknown link format': 'Format de lien inconnu',
    'Link too large': 'Lien trop volumineux',
    'Not an image': 'Ce n’est pas une image',
  });
})(window.PZ = window.PZ || {});
