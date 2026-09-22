/* ============================================================
   ProcureFlow - intro panel and guided tour
   ------------------------------------------------------------
   A first-time visitor (usually a recruiter) sees a short intro
   on the Overview and can take a one-minute tour through the
   real screens: overview, comparison, suggestion, decision and
   a late purchase order.

   The tour only clicks the app's own buttons and reads numbers
   through PF.logic, so every figure it quotes is the same figure
   the screen shows. Intro and tour are in Finnish or English;
   the app itself stays in English.
   ============================================================ */

(function () {
  "use strict";

  const L = PF.logic;
  const store = PF.store;

  const KEY_LANG = "procureflow.lang";
  const KEY_INTRO = "procureflow.introHidden";

  const CONTACT =
    '<a href="https://assishnepali.github.io" target="_blank" rel="noopener">Portfolio</a>' +
    '<a href="https://www.linkedin.com/in/assishsapkota/" target="_blank" rel="noopener">LinkedIn</a>' +
    '<a href="mailto:assishnepali@gmail.com">%EMAIL%</a>';

  /* ---------- texts ---------- */

  const T = {
    fi: {
      eyebrow: "Portfolioprojekti · Assish Sapkota",
      title: "Ostajan työpäivä yhdessä näkymässä",
      text: "ProcureFlow seuraa yhtä hankintaa alusta loppuun: tarjousten vertailu, toimittajan valinta perusteluineen, " +
        "ostotilaus ja myöhästyneiden toimitusten seuranta. Yritykset ja luvut ovat keksittyjä.",
      p1: "Vertaa kokonaishintaa, ei pelkkää kappalehintaa",
      p2: "Suosittelee halvinta toimittajaa, joka ehtii ajoissa",
      p3: "Nostaa myöhässä olevat tilaukset listan kärkeen",
      start: "Katso minuutin esittely",
      explore: "Tutustun itse",
      credit: "Työnkulun ja säännöt suunnitteli Assish Sapkota. Koodi on tehty tekoälyn avustuksella. Sovellus on englanniksi.",
      email: "Sähköposti",
      close: "Piilota esittely",
      launch: "Esittely",
      next: "Seuraava",
      back: "Takaisin",
      finish: "Valmis",
      skip: "Sulje esittely",
      of: " / ",
      unit: function (u) { return u === "pcs" ? "kpl" : u; }
    },
    en: {
      eyebrow: "Portfolio project · Assish Sapkota",
      title: "A buyer's workday in one screen",
      text: "ProcureFlow follows one purchase from start to finish: comparing supplier quotations, choosing a supplier " +
        "with a reason, creating the purchase order and chasing late deliveries. All companies and figures are fictional.",
      p1: "Compares total cost, not just the unit price",
      p2: "Suggests the cheapest supplier that delivers on time",
      p3: "Brings late orders to the top of the list",
      start: "Take the one-minute tour",
      explore: "Explore on my own",
      credit: "Workflow and rules designed by Assish Sapkota. Code written with AI assistance.",
      email: "Email",
      close: "Hide intro",
      launch: "Guided tour",
      next: "Next",
      back: "Back",
      finish: "Finish",
      skip: "Close tour",
      of: " of ",
      unit: function (u) { return u; }
    }
  };

  let lang = readLang();

  function t(key) {
    return T[lang][key];
  }

  function readLang() {
    try {
      const saved = window.localStorage.getItem(KEY_LANG);
      if (saved === "fi" || saved === "en") return saved;
    } catch (e) { /* storage blocked: fall through */ }
    return /^fi\b/i.test(navigator.language || "") ? "fi" : "en";
  }

  function setLang(value) {
    lang = value;
    try { window.localStorage.setItem(KEY_LANG, value); } catch (e) { /* ignore */ }
    applyTexts();
    if (tour.active) showStep(tour.index, true);
  }

  function eur(value) {
    if (value === null || value === undefined || !isFinite(value)) return "-";
    return new Intl.NumberFormat(lang === "fi" ? "fi-FI" : "en-IE", {
      style: "currency", currency: "EUR", maximumFractionDigits: 0
    }).format(value);
  }

  function num(value) {
    return new Intl.NumberFormat(lang === "fi" ? "fi-FI" : "en-GB").format(value);
  }

  function esc(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function applyTexts() {
    document.documentElement.setAttribute("data-tour-lang", lang);
    document.querySelectorAll("[data-t]").forEach(function (node) {
      const value = T[lang][node.getAttribute("data-t")];
      if (typeof value === "string") node.textContent = value;
    });
    document.querySelectorAll("[data-t-aria]").forEach(function (node) {
      const label = T[lang][node.getAttribute("data-t-aria")];
      node.setAttribute("aria-label", label);
      node.setAttribute("title", label);
    });
    document.querySelectorAll(".lang__btn").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    });
  }

  /* ---------- intro panel ---------- */

  function introHidden() {
    try { return window.localStorage.getItem(KEY_INTRO) === "1"; } catch (e) { return false; }
  }

  function hideIntro() {
    document.getElementById("intro").hidden = true;
    try { window.localStorage.setItem(KEY_INTRO, "1"); } catch (e) { /* ignore */ }
  }

  function showIntro() {
    document.getElementById("intro").hidden = false;
    try { window.localStorage.removeItem(KEY_INTRO); } catch (e) { /* ignore */ }
  }

  /* ---------- facts the tour quotes (read from the real data) ---------- */

  function data() {
    return store.get();
  }

  function demoRequest() {
    const d = data();
    return d.requests.find(function (r) { return r.reference === "REQ-2026-0001"; }) ||
      d.requests.find(function (r) { return !r.decision; }) ||
      d.requests[0] || null;
  }

  function demoOrder() {
    const d = data();
    const open = d.orders.filter(L.isOpen);
    return open.find(function (o) {
      return L.orderFlags(o).some(function (f) { return f.severity === "critical"; });
    }) ||
      open.find(function (o) { return L.displayStatus(o) === "Partially received"; }) ||
      open[0] || null;
  }

  /* ---------- driving the app through its own buttons ---------- */

  function closeDialogs() {
    document.querySelectorAll("dialog[open]").forEach(function (dlg) { dlg.close(); });
  }

  function goOverview() {
    closeDialogs();
    document.querySelector('.nav__link[data-view="overview"]').click();
  }

  function openDemoRequest() {
    closeDialogs();
    const request = demoRequest();
    if (!request) return false;
    // Only open it if it is not already open: the row button toggles.
    const detailTitle = document.getElementById("reqDetailTitle");
    const isOpen = detailTitle && detailTitle.textContent.indexOf(request.reference) === 0;
    const onSourcing = !document.getElementById("view-sourcing").hidden;
    if (isOpen && onSourcing) return true;
    if (isOpen) {
      document.querySelector('.nav__link[data-view="sourcing"]').click();
      return true;
    }
    document.getElementById("demoStep1").click();
    return Boolean(document.getElementById("reqDetailTitle"));
  }

  function openDemoOrder() {
    const order = demoOrder();
    if (!order) return false;
    const dlg = document.getElementById("poDetailDialog");
    if (dlg.open && document.getElementById("poDetailTitle").textContent.indexOf(order.reference) === 0) {
      return true;
    }
    closeDialogs();
    // The Overview attention list has an "Open" button for every flagged order.
    const button = document.querySelector('[data-attention-kind="order"][data-attention-id="' + order.id + '"]');
    if (button) {
      button.click();
    } else {
      document.getElementById("demoStep3").click();
    }
    return dlg.open;
  }

  function visible(selector, root) {
    const nodes = (root || document).querySelectorAll(selector);
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].offsetParent !== null || nodes[i].getClientRects().length) return nodes[i];
    }
    return null;
  }

  /* ---------- steps ---------- */

  const STEPS = [
    {
      prepare: goOverview,
      target: function () { return document.querySelector(".panel--attention"); },
      text: function () {
        const count = L.attentionItems(data()).length;
        return lang === "fi"
          ? {
            h: "Päivän alku",
            p: "Tähän kootaan automaattisesti kaikki, mikä vaatii toimia: myöhässä olevat tilaukset, " +
              "erääntyneet muistutukset ja päätöstä odottavat hankinnat. Nyt listalla on " + count + " asiaa."
          }
          : {
            h: "Start of the day",
            p: "Everything that needs action is collected here automatically: late orders, follow-ups " +
              "that are due and requests waiting for a decision. Right now there are " + count + " items."
          };
      }
    },
    {
      prepare: openDemoRequest,
      target: function () { return visible(".compare-table-wrap") || visible(".quote-cards"); },
      text: function () {
        const request = demoRequest();
        const c = L.compareRequest(request, data().quotations);
        const rec = c.recommended;
        const cheap = c.cheapestValid;
        const late = cheap && rec && cheap !== rec && cheap.meetsDeadline === false;
        const unit = T[lang].unit(request.unit);
        if (lang === "fi") {
          return {
            h: "Tarjoukset rinnakkain",
            p: c.rows.length + " tarjousta samasta tuotteesta (" + num(request.quantity) + " " + esc(unit) + "). " +
              "Rahti, lisämaksut ja alennukset lasketaan mukaan, joten tarjouksia verrataan kokonaishinnalla." +
              (late ? " Halvin on " + esc(cheap.supplierName) + " (" + eur(cheap.totalQuotedCost) + "), mutta se " +
                "toimittaisi " + cheap.daysLate + " päivää liian myöhään." : "")
          };
        }
        return {
          h: "Compare offers like for like",
          p: c.rows.length + " quotations for the same " + num(request.quantity) + " " + esc(unit) + ". " +
            "Freight, other charges and discounts are added in, so every offer is compared on total cost." +
            (late ? " The cheapest, " + esc(cheap.supplierName) + " at " + eur(cheap.totalQuotedCost) +
              ", would arrive " + cheap.daysLate + " days too late." : "")
        };
      }
    },
    {
      prepare: openDemoRequest,
      target: function () { return visible(".recommendation"); },
      text: function () {
        const c = L.compareRequest(demoRequest(), data().quotations);
        const rec = c.recommended;
        if (!rec) {
          return lang === "fi"
            ? { h: "Rehellinen suositus", p: "Mikään tarjous ei ehdi ajoissa, ja sovellus sanoo sen suoraan sen sijaan, että valitsisi voittajan väkisin." }
            : { h: "An honest suggestion", p: "No offer can meet the date, and the app says so plainly instead of forcing a winner." };
        }
        return lang === "fi"
          ? {
            h: "Selkeä suositus",
            p: esc(rec.supplierName) + " (" + eur(rec.totalQuotedCost) + ") on halvin tarjous, joka ehtii ajoissa. " +
              "Sääntö on kirjoitettu ruudulle kokonaan, eikä taustalla ole piilotettua pisteytystä."
          }
          : {
            h: "A clear suggestion",
            p: esc(rec.supplierName) + " at " + eur(rec.totalQuotedCost) + " is the cheapest offer that arrives on time. " +
              "The rule is written out on screen, with no hidden score behind it."
          };
      }
    },
    {
      prepare: openDemoRequest,
      target: function () { return visible("#requestDetail .decision-area"); },
      text: function () {
        return lang === "fi"
          ? {
            h: "Ostaja päättää",
            p: "Lopullisen valinnan tekee aina ostaja. Jos valitset toisen toimittajan tai hyväksyt myöhäisen " +
              "toimituksen, sovellus pyytää kirjallisen perustelun. Päätös on silloin helppo selittää jälkikäteen, " +
              "ja ostotilaus syntyy valitusta tarjouksesta ilman uudelleen kirjoittamista."
          }
          : {
            h: "The buyer decides",
            p: "The final choice is always the buyer's. Picking another supplier or accepting a late delivery " +
              "requires a written reason, so the decision can be explained later. The purchase order is then " +
              "created from the chosen quotation without retyping anything."
          };
      }
    },
    {
      prepare: openDemoOrder,
      target: function () {
        const body = document.getElementById("poDetailBody");
        return visible(".callout", body) || visible(".po-section", body);
      },
      text: function () {
        const order = demoOrder();
        if (!order) {
          return lang === "fi"
            ? { h: "Tilauksen jälkeen", p: "Avoimia tilauksia ei nyt ole. Palauta esittelydata About-sivulta." }
            : { h: "After the order", p: "There are no open orders right now. Restore the demo data from the About page." };
        }
        const s = order.snapshot || {};
        const unit = T[lang].unit(s.unit || "");
        const received = L.receivedQuantity(order);
        const outstanding = L.outstandingQuantity(order);
        const daysLate = L.daysBetween(order.confirmedDeliveryDate, L.today());
        const isLate = daysLate !== null && daysLate > 0 && outstanding > 0;
        if (lang === "fi") {
          return {
            h: "Tilauksen jälkeen",
            p: esc(order.reference) + ": tilattu " + num(order.quantityOrdered) + " " + esc(unit) + ", saapunut " +
              num(received) + ", puuttuu vielä " + num(outstanding) + "." +
              (isLate ? " Vahvistettu toimituspäivä meni " + daysLate + " päivää sitten." : "") +
              " Alkuperäinen luvattu päivä säilyy, vaikka toimittaja antaa uuden, joten myöhästyminen ei katoa tiedoista."
          };
        }
        return {
          h: "After the order",
          p: esc(order.reference) + ": " + num(order.quantityOrdered) + " " + esc(unit) + " ordered, " +
            num(received) + " received, " + num(outstanding) + " still outstanding." +
            (isLate ? " The confirmed delivery date passed " + daysLate + " days ago." : "") +
            " The original promised date is kept even when the supplier gives a new one, so the delay stays on record."
        };
      }
    },
    {
      prepare: goOverview,
      target: function () { return null; },
      final: true,
      text: function () {
        return lang === "fi"
          ? {
            h: "Siinä koko ketju",
            p: "Yksi hankinta tarjouksesta toimitukseen, ja luvut ja perustelut pysyvät tallessa. " +
              "Kokeile vapaasti: lisää tarjous tai kirjaa toimitus. Kaikki tallentuu vain tähän selaimeen, " +
              "eikä mitään lähetetä minnekään."
          }
          : {
            h: "That's the whole flow",
            p: "One purchase from quotation to delivery, with the numbers and the reasons kept together. " +
              "Feel free to try it: add a quotation or record a delivery. Everything stays in this browser " +
              "and nothing is sent anywhere."
          };
      }
    }
  ];

  /* ---------- tour engine ---------- */

  const tour = { active: false, index: 0, focus: null, card: null };

  function buildCard() {
    const card = document.createElement("section");
    card.className = "tour-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-live", "polite");
    card.setAttribute("aria-labelledby", "tourHeading");
    card.addEventListener("click", function (event) {
      const action = event.target.closest("[data-tour]");
      if (!action) return;
      const what = action.getAttribute("data-tour");
      if (what === "next") move(1);
      if (what === "back") move(-1);
      if (what === "close") stop();
    });
    return card;
  }

  function clearFocus() {
    if (tour.focus) tour.focus.classList.remove("tour-focus");
    tour.focus = null;
  }

  function showStep(index, keepPosition) {
    const step = STEPS[index];
    tour.index = index;
    clearFocus();

    if (!keepPosition) {
      // Park the card first, so closing a dialog it sat in is not read as "tour closed".
      document.body.appendChild(tour.card);
      step.prepare();
    }

    // The card has to sit inside an open modal dialog, or the dialog
    // would cover it and make it unclickable.
    const openDialog = document.querySelector("dialog[open]");
    const host = openDialog || document.body;
    if (tour.card.parentNode !== host) host.appendChild(tour.card);

    const content = step.text();
    const total = STEPS.length;
    const last = index === total - 1;

    tour.card.classList.toggle("tour-card--final", Boolean(step.final));
    tour.card.innerHTML =
      '<div class="tour-card__top">' +
        '<span class="tour-card__count">' + (index + 1) + t("of") + total + "</span>" +
        '<span class="tour-card__bar"><span style="width:' + Math.round(((index + 1) / total) * 100) + '%"></span></span>' +
        '<button type="button" class="tour-card__x" data-tour="close" aria-label="' + t("skip") + '" title="' + t("skip") + '">&times;</button>' +
      "</div>" +
      '<h2 class="tour-card__title" id="tourHeading">' + content.h + "</h2>" +
      '<p class="tour-card__text">' + content.p + "</p>" +
      (step.final
        ? '<p class="tour-card__contact"><strong>Assish Sapkota</strong>' +
          CONTACT.replace("%EMAIL%", t("email")) + "</p>"
        : "") +
      '<div class="tour-card__nav">' +
        (index > 0 ? '<button type="button" class="btn btn--ghost btn--sm" data-tour="back">' + t("back") + "</button>" : "<span></span>") +
        '<button type="button" class="btn btn--primary btn--sm" data-tour="' + (last ? "close" : "next") + '">' +
          (last ? t("finish") : t("next") + " &rarr;") + "</button>" +
      "</div>";

    const target = step.target();
    if (target) {
      target.classList.add("tour-focus");
      tour.focus = target;
      target.scrollIntoView({ block: "start", behavior: "auto" });
    } else {
      window.scrollTo(0, 0);
    }

    const primary = tour.card.querySelector(".btn--primary");
    if (primary) primary.focus({ preventScroll: true });
  }

  function move(delta) {
    const next = tour.index + delta;
    if (next < 0 || next >= STEPS.length) return;
    showStep(next);
  }

  function start(fromStep) {
    if (!tour.card) tour.card = buildCard();
    tour.active = true;
    document.documentElement.classList.add("is-touring");
    const first = typeof fromStep === "number" && fromStep >= 0 && fromStep < STEPS.length ? fromStep : 0;
    showStep(first);
  }

  function stop() {
    tour.active = false;
    clearFocus();
    if (tour.card && tour.card.parentNode) tour.card.parentNode.removeChild(tour.card);
    document.documentElement.classList.remove("is-touring");
    closeDialogs();
  }

  document.addEventListener("keydown", function (event) {
    if (!tour.active) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test((event.target && event.target.tagName) || "");
    if (typing) return;
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
  });

  // Esc (or the dialog's own Close button) closes an open dialog. If the
  // tour card lived in it, the tour ends too. Watching the "open"
  // attribute is more dependable than the dialog's close event.
  const dialogWatcher = new MutationObserver(function (records) {
    if (!tour.active || !tour.card) return;
    records.forEach(function (record) {
      const dlg = record.target;
      if (!dlg.open && dlg.contains(tour.card)) stop();
    });
  });
  document.querySelectorAll("dialog").forEach(function (dlg) {
    dialogWatcher.observe(dlg, { attributes: true, attributeFilter: ["open"] });
  });

  /* ---------- wiring ---------- */

  function init() {
    applyTexts();

    if (!introHidden()) document.getElementById("intro").hidden = false;

    document.getElementById("tourStart").addEventListener("click", function () { start(0); });
    document.getElementById("tourLaunch").addEventListener("click", function () {
      showIntro();
      start(0);
    });
    document.getElementById("introExplore").addEventListener("click", function () {
      hideIntro();
      document.querySelector(".panel--attention").scrollIntoView({ block: "start", behavior: "smooth" });
    });
    document.getElementById("introClose").addEventListener("click", hideIntro);
    document.querySelectorAll(".lang__btn").forEach(function (b) {
      b.addEventListener("click", function () { setLang(b.dataset.lang); });
    });

    // ?tour starts the tour straight away, ?tour=3 at step 3; ?lang=fi or ?lang=en picks the language.
    const params = new URLSearchParams(window.location.search);
    if (params.has("lang") && T[params.get("lang")]) setLang(params.get("lang"));
    if (params.has("tour")) {
      const step = parseInt(params.get("tour"), 10);
      window.setTimeout(function () { start(isNaN(step) ? 0 : step - 1); }, 300);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
