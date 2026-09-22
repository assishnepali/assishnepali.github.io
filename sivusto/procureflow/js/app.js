/* ============================================================
   ProcureFlow - user interface
   ------------------------------------------------------------
   The pattern is the same everywhere:
     1. something changes the stored data
     2. PF.store.save() writes it to localStorage
     3. render() redraws the screen from that data

   The screen is therefore always a direct reflection of what is
   stored. No figure is held in two places.
   ============================================================ */

(function () {
  "use strict";

  const L = PF.logic;
  const store = PF.store;

  /* ---------- small helpers ---------- */

  function el(id) {
    return document.getElementById(id);
  }

  /* Anything typed by a user is escaped before it becomes HTML. */
  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDate(iso) {
    if (!iso) return "Not set";
    const p = String(iso).split("-");
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (isNaN(d.getTime())) return esc(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtNum(value) {
    if (value === null || value === undefined || !isFinite(value)) return "-";
    return new Intl.NumberFormat("en-IE", { maximumFractionDigits: 4 }).format(value);
  }

  function fmtEur(value) {
    return L.formatEur(value);
  }

  function newId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  let toastTimer = null;
  function toast(message) {
    const node = el("toast");
    node.textContent = message;
    node.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      node.hidden = true;
    }, 3200);
  }

  /* A confirmation dialog used before anything destructive. */
  let confirmAction = null;

  /* `destructive` decides how the confirm button looks: red for anything
     that deletes or replaces data, plain for a simple acknowledgement. */
  function askConfirm(title, bodyHtml, okLabel, onConfirm, destructive) {
    const ok = el("confirmOkBtn");
    el("confirmTitle").textContent = title;
    el("confirmBody").innerHTML = bodyHtml;
    ok.textContent = okLabel;
    ok.classList.toggle("btn--danger", destructive !== false);
    ok.classList.toggle("btn--ghost", destructive === false);
    confirmAction = onConfirm;
    el("confirmDialog").showModal();
    ok.focus();
  }

  /* ---------- view state ---------- */

  const ui = {
    view: "overview",
    selectedRequestId: null,
    activeOrderId: null,
    quotationEditId: null,
    decisionQuoteId: null,
    orderFromQuotationId: null,
    receiptEditId: null,
    filters: { search: "", status: "all", supplier: "all" }
  };

  function data() {
    return store.get();
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */

  function switchView(name) {
    ui.view = name;
    document.querySelectorAll(".view").forEach(function (section) {
      section.hidden = section.id !== "view-" + name;
    });
    document.querySelectorAll(".nav__link").forEach(function (button) {
      const active = button.dataset.view === name;
      button.classList.toggle("is-active", active);
      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
    window.scrollTo(0, 0);
  }

  /* ============================================================
     RENDER: everything
     ============================================================ */

  function render() {
    renderOverview();
    renderSourcing();
    renderOrders();
    renderSuppliers();
    renderActivity();
    fillSupplierDropdowns();
  }

  /* ---------- startup messages ---------- */

  function renderStartupMessages() {
    const messages = store.getStartupMessages();
    el("startupMessages").innerHTML = messages
      .map(function (m) {
        const kind = m.kind === "warning" ? "warning" : "info";
        return '<p class="callout callout--' + kind + '">' + esc(m.text) + "</p>";
      })
      .join("");
  }

  /* ---------- OVERVIEW ---------- */

  function renderOverview() {
    const d = data();
    const metrics = L.overviewMetrics(d);

    el("todayLabel").textContent = "Today: " + fmtDate(L.today());
    el("kpiOpenOrders").textContent = metrics.openOrderCount;
    el("kpiOutstandingValue").textContent = fmtEur(metrics.outstandingGoodsValue);
    el("kpiOverdue").textContent = metrics.overdueCount;
    el("kpiAwaiting").textContent = metrics.awaitingDecisionCount;

    // Needs attention
    const items = L.attentionItems(d);
    el("attentionCount").textContent =
      items.length === 0 ? "Nothing outstanding" : items.length + " items";

    if (items.length === 0) {
      const nothingRecorded = d.requests.length === 0 && d.orders.length === 0;
      el("attentionList").innerHTML = nothingRecorded
        ? '<p class="empty">Nothing recorded yet. Go to <strong>Sourcing</strong> to raise a ' +
          "purchasing request, or <strong>About</strong> to restore the demonstration data.</p>"
        : '<p class="empty">Nothing needs attention. Every placed order is within its confirmed ' +
          "date and every request has a decision.</p>";
    } else {
      el("attentionList").innerHTML = items
        .map(function (item) {
          return (
            '<button type="button" class="attention__item attention__item--' + item.severity +
            '" data-attention-kind="' + item.kind + '" data-attention-id="' + esc(item.id) + '">' +
            '<span class="attention__body">' +
            '<span class="attention__title">' + esc(item.label) + " &middot; " + esc(item.title) + "</span>" +
            '<span class="attention__detail">' + esc(item.detail) + "</span>" +
            "</span>" +
            '<span class="attention__go">Open &rarr;</span>' +
            "</button>"
          );
        })
        .join("");
    }

    renderChart();
  }

  function renderChart() {
    const months = L.monthlyOrderValue(data(), 6);
    const max = Math.max.apply(null, months.map(function (m) { return m.total; }));

    el("orderChart").innerHTML = months
      .map(function (m) {
        const hasData = m.total > 0;
        const height = max > 0 && hasData ? Math.max(4, Math.round((m.total / max) * 160)) : 3;
        return (
          '<div class="chart__col">' +
          '<span class="chart__value">' + (hasData ? fmtEur(m.total) : "No data") + "</span>" +
          '<div class="chart__bar' + (hasData ? "" : " chart__bar--empty") +
          '" style="height:' + height + 'px"></div>' +
          '<span class="chart__label">' + esc(m.label) + "</span>" +
          "</div>"
        );
      })
      .join("");

    el("orderChartText").textContent =
      "Purchase order value by order month: " +
      months
        .map(function (m) {
          return m.fullLabel + ": " + (m.total > 0 ? fmtEur(m.total) + " from " + m.count + " orders" : "no data");
        })
        .join(", ");
  }

  /* ---------- SOURCING ---------- */

  function renderSourcing() {
    const d = data();

    el("requestCount").textContent =
      d.requests.length + (d.requests.length === 1 ? " request" : " requests");

    if (d.requests.length === 0) {
      el("requestTableBody").innerHTML =
        '<tr><td colspan="7"><p class="empty">No purchasing requests yet. ' +
        "Start with <strong>+ New purchasing request</strong>: write down what is needed and by when, " +
        "then add the quotations you receive against it.</p></td></tr>";
      renderRequestDetail();
      return;
    }

    el("requestTableBody").innerHTML = d.requests
      .slice()
      .sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      })
      .map(function (r) {
        const quotes = d.quotations.filter(function (q) { return q.requestId === r.id; });
        const linkedOrder = d.orders.find(function (o) { return o.requestId === r.id; });

        let statusHtml;
        if (linkedOrder) {
          statusHtml = '<span class="badge badge--received">Ordered as ' + esc(linkedOrder.reference) + "</span>";
        } else if (r.decision) {
          statusHtml = '<span class="badge badge--ordered">Decided, no PO yet</span>';
        } else if (quotes.length === 0) {
          statusHtml = '<span class="badge badge--draft">Awaiting quotations</span>';
        } else {
          statusHtml = '<span class="badge badge--partially">Awaiting decision</span>';
        }

        const selected = r.id === ui.selectedRequestId ? " row-selected" : "";

        return (
          '<tr class="' + selected.trim() + '">' +
          '<td class="ref">' + esc(r.reference) + "</td>" +
          "<td>" + esc(r.product) + "</td>" +
          '<td class="num">' + fmtNum(r.quantity) + " " + esc(r.unit) + "</td>" +
          "<td>" + fmtDate(r.requiredDate) + "</td>" +
          '<td class="num">' + quotes.length + "</td>" +
          "<td>" + statusHtml + "</td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn--sm btn--ghost" type="button" data-open-request="' + esc(r.id) + '">' +
          (r.id === ui.selectedRequestId ? "Hide" : "Open") + "</button>" +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");

    renderRequestDetail();
  }

  function renderRequestDetail() {
    const container = el("requestDetail");
    const d = data();

    if (!ui.selectedRequestId) {
      container.innerHTML = "";
      return;
    }

    const request = d.requests.find(function (r) { return r.id === ui.selectedRequestId; });
    if (!request) {
      container.innerHTML = "";
      return;
    }

    const comparison = L.compareRequest(request, d.quotations);
    const linkedOrder = d.orders.find(function (o) { return o.requestId === request.id; });

    container.innerHTML =
      '<section class="panel" aria-labelledby="reqDetailTitle">' +
        '<div class="panel__head panel__head--row">' +
          "<div>" +
            '<h2 id="reqDetailTitle">' + esc(request.reference) + " &middot; " + esc(request.product) + "</h2>" +
            '<p class="panel__sub">' + esc(request.specification) + "</p>" +
          "</div>" +
          '<div class="button-row">' +
            '<button class="btn btn--ghost btn--sm" type="button" data-edit-request="' + esc(request.id) + '">Edit request</button>' +
            '<button class="btn btn--primary btn--sm" type="button" data-add-quote="' + esc(request.id) + '">+ Add quotation</button>' +
          "</div>" +
        "</div>" +
        renderRequestFacts(request) +
      "</section>" +

      '<section class="panel" aria-labelledby="comparisonTitle">' +
        '<div class="panel__head">' +
          '<h2 id="comparisonTitle">Quotation comparison</h2>' +
          '<p class="panel__sub">' +
            "All quotations are for the same specification, quantity and unit. " +
            "Total quoted cost = quantity &times; unit price + freight + other charges &minus; discount. " +
            "EUR excluding VAT." +
          "</p>" +
        "</div>" +
        renderComparison(comparison) +
        renderRecommendation(comparison, request) +
        '<div class="decision-area">' + renderDecisionArea(request, comparison, linkedOrder) + "</div>" +
      "</section>";
  }

  function renderRequestFacts(request) {
    const items = [
      ["Quantity", fmtNum(request.quantity) + " " + esc(request.unit)],
      ["Required delivery date", fmtDate(request.requiredDate)],
      ["Delivery location", esc(request.deliveryLocation)],
      ["Budget (excl. VAT)", request.budget ? fmtEur(request.budget) : "Not set"],
      ["Raised", fmtDate(request.createdAt)]
    ];

    let html =
      '<div class="detail-grid">' +
      items
        .map(function (pair) {
          return (
            '<div class="detail-item">' +
            '<p class="detail-item__label">' + pair[0] + "</p>" +
            '<p class="detail-item__value">' + pair[1] + "</p>" +
            "</div>"
          );
        })
        .join("") +
      "</div>";

    if (request.notes) {
      html += '<p class="hint" style="margin-top:12px"><strong>Buyer notes:</strong> ' + esc(request.notes) + "</p>";
    }
    return html;
  }

  /* Builds both the wide comparison table (desktop) and the stacked
     cards (mobile). CSS decides which one is visible.               */
  function renderComparison(comparison) {
    if (comparison.rows.length === 0) {
      return '<p class="empty">No quotations recorded yet. Add at least two to compare like for like.</p>';
    }

    const rows = comparison.rows;

    function colClass(row) {
      if (row.isRecommended) return "col-recommended";
      if (!row.valid) return "col-invalid";
      return "";
    }

    function problemChips(row) {
      if (row.problems.length === 0) {
        return '<span class="chip chip--ok">Comparable</span>';
      }
      return row.problems
        .map(function (p) {
          const severity = p.code === "incomplete" || p.code === "expired" || p.code === "non-compliant"
            ? "critical" : "warning";
          return '<span class="chip chip--' + severity + '" title="' + esc(p.detail) + '">' + esc(p.label) + "</span>";
        })
        .join("");
    }

    function deliveryCell(row) {
      if (!row.quote.earliestDelivery) return "Not quoted";
      const base = fmtDate(row.quote.earliestDelivery);
      if (row.meetsDeadline === true) {
        return base + '<br><span class="chip chip--ok">Meets required date</span>';
      }
      if (row.meetsDeadline === false) {
        return base + '<br><span class="chip chip--critical">' + row.daysLate + " days late</span>";
      }
      return base;
    }

    function premiumCell(row) {
      if (row.costPremium === null) return "-";
      if (row.costPremium === 0) return '<span class="chip chip--ok">Lowest comparable cost</span>';
      return "+" + fmtEur(row.costPremium);
    }

    function money(value) {
      return value === null || value === undefined ? "Not quoted" : fmtEur(value);
    }

    const header =
      "<tr><th scope='col'>Line</th>" +
      rows
        .map(function (row) {
          const tags = [];
          if (row.isRecommended) tags.push("Recommended");
          if (row.isCheapestValid) tags.push("Lowest cost");
          if (row.isEarliest) tags.push("Earliest");
          if (row.isLongestTerms) tags.push("Longest terms");
          return (
            "<th scope='col' class='" + colClass(row) + "'>" +
            "<span class='compare-head__name'>" + esc(row.supplierName) + "</span>" +
            (tags.length
              ? "<br><span class='compare-head__meta'>" +
                tags.map(esc).join(" &middot; ") + "</span>"
              : "") +
            "</th>"
          );
        })
        .join("") +
      "</tr>";

    function line(label, fn, extraClass) {
      return (
        "<tr class='" + (extraClass || "") + "'><th scope='row'>" + label + "</th>" +
        rows
          .map(function (row) {
            return "<td class='" + colClass(row) + "'>" + fn(row) + "</td>";
          })
          .join("") +
        "</tr>"
      );
    }

    const table =
      "<div class='table-wrap compare-table-wrap'><table class='compare-table'>" +
      "<caption class='visually-hidden'>Quotation comparison for this request</caption>" +
      "<thead>" + header + "</thead><tbody>" +
      line("Status", problemChips) +
      line("Quoted specification", function (r) { return esc(r.quote.quotedSpec); }) +
      line("Quantity", function (r) { return fmtNum(r.quote.quantity) + " " + esc(r.quote.unit); }) +
      line("Unit price", function (r) { return money(r.quote.unitPrice); }) +
      line("Goods value", function (r) { return money(r.goodsValue); }) +
      line("Freight", function (r) { return money(r.quote.freight); }) +
      line("Other charges", function (r) { return money(r.quote.otherCharges); }) +
      line("Discount", function (r) {
        return r.quote.discount === null || r.quote.discount === undefined
          ? "Not quoted"
          : "&minus; " + fmtEur(r.quote.discount);
      }) +
      line("Total quoted cost", function (r) { return money(r.totalQuotedCost); }, "total-row") +
      line("Effective unit cost", function (r) { return money(r.effectiveUnitCost); }) +
      line("Cost premium", premiumCell) +
      line("Earliest delivery", deliveryCell) +
      line("Quote valid until", function (r) {
        return r.quote.validUntil ? fmtDate(r.quote.validUntil) : "Not stated";
      }) +
      line("Minimum order", function (r) {
        return L.isNumber(r.quote.minOrderQuantity)
          ? fmtNum(r.quote.minOrderQuantity) + " " + esc(r.quote.unit)
          : "Not stated";
      }) +
      line("Payment terms", function (r) {
        return L.isNumber(r.quote.paymentTermsDays) ? r.quote.paymentTermsDays + " days" : "Not stated";
      }) +
      line("Notes", function (r) { return r.quote.notes ? esc(r.quote.notes) : "-"; }) +
      line("", function (r) {
        return (
          "<div class='row-actions'>" +
          "<button class='btn btn--sm btn--ghost' type='button' data-edit-quote='" + esc(r.quote.id) + "'>Edit</button>" +
          "<button class='btn btn--sm btn--danger' type='button' data-delete-quote='" + esc(r.quote.id) + "'>Delete</button>" +
          "</div>"
        );
      }) +
      "</tbody></table></div>";

    // Stacked cards for narrow screens
    const cards =
      "<div class='quote-cards'>" +
      rows
        .map(function (r) {
          const cls =
            "quote-card" +
            (r.isRecommended ? " quote-card--recommended" : "") +
            (!r.valid ? " quote-card--invalid" : "");
          return (
            "<div class='" + cls + "'>" +
            "<div class='quote-card__head'>" +
            "<div><p class='quote-card__name'>" + esc(r.supplierName) + "</p>" +
            "<div>" + problemChips(r) + "</div></div>" +
            "<p class='quote-card__total'>" + money(r.totalQuotedCost) + "</p>" +
            "</div>" +
            "<div class='quote-card__lines'>" +
            "<div class='quote-card__line'><span>Quantity</span><span>" + fmtNum(r.quote.quantity) + " " + esc(r.quote.unit) + "</span></div>" +
            "<div class='quote-card__line'><span>Unit price</span><span>" + money(r.quote.unitPrice) + "</span></div>" +
            "<div class='quote-card__line'><span>Goods value</span><span>" + money(r.goodsValue) + "</span></div>" +
            "<div class='quote-card__line'><span>Freight</span><span>" + money(r.quote.freight) + "</span></div>" +
            "<div class='quote-card__line'><span>Other charges</span><span>" + money(r.quote.otherCharges) + "</span></div>" +
            "<div class='quote-card__line'><span>Discount</span><span>" + (L.isNumber(r.quote.discount) ? "&minus; " + fmtEur(r.quote.discount) : "Not quoted") + "</span></div>" +
            "<hr class='quote-card__rule'>" +
            "<div class='quote-card__line'><span><strong>Total quoted cost</strong></span><span>" + money(r.totalQuotedCost) + "</span></div>" +
            "<div class='quote-card__line'><span>Effective unit cost</span><span>" + money(r.effectiveUnitCost) + "</span></div>" +
            "<div class='quote-card__line'><span>Cost premium</span><span>" + premiumCell(r) + "</span></div>" +
            "<hr class='quote-card__rule'>" +
            "<div class='quote-card__line'><span>Earliest delivery</span><span>" + deliveryCell(r) + "</span></div>" +
            "<div class='quote-card__line'><span>Payment terms</span><span>" + (L.isNumber(r.quote.paymentTermsDays) ? r.quote.paymentTermsDays + " days" : "Not stated") + "</span></div>" +
            "</div>" +
            "<div class='row-actions' style='margin-top:10px'>" +
            "<button class='btn btn--sm btn--ghost' type='button' data-edit-quote='" + esc(r.quote.id) + "'>Edit</button>" +
            "<button class='btn btn--sm btn--danger' type='button' data-delete-quote='" + esc(r.quote.id) + "'>Delete</button>" +
            "</div>" +
            "</div>"
          );
        })
        .join("") +
      "</div>";

    const footnote =
      '<p class="hint" style="margin-top:10px">' +
      "<strong>Cost premium</strong> is measured against the lowest total quoted cost among the " +
      "comparable quotations, whether or not that one can arrive in time. The suggested option is " +
      "the cheapest that <em>can</em> arrive by the required date, so it is not always the one with " +
      "no premium." +
      "</p>";

    return table + cards + footnote;
  }

  function renderRecommendation(comparison, request) {
    const hasNone = !comparison.recommended;
    const cls = hasNone ? "recommendation recommendation--none" : "recommendation";
    const headline = hasNone
      ? "No quotation can meet the required date of " + fmtDate(request.requiredDate)
      : "Suggested: " + esc(comparison.recommended.supplierName) +
        " at " + fmtEur(comparison.recommended.totalQuotedCost);

    return (
      '<div class="' + cls + '">' +
      '<p class="recommendation__label">Lowest total quoted cost that meets the required date</p>' +
      '<p class="recommendation__headline">' + headline + "</p>" +
      '<p class="recommendation__text">' + esc(comparison.explanation) + "</p>" +
      "</div>"
    );
  }

  function renderDecisionArea(request, comparison, linkedOrder) {
    const d = data();

    if (request.decision) {
      const chosen = d.quotations.find(function (q) { return q.id === request.decision.quotationId; });
      const row = comparison.rows.find(function (r) { return r.quote.id === request.decision.quotationId; });

      let html =
        '<h3 class="subhead">Decision summary</h3>' +
        '<div class="decision-summary">' +
        '<div class="detail-grid">' +
        '<div><p class="detail-item__label">Selected supplier</p><p class="detail-item__value">' +
          esc(row ? row.supplierName : "Unknown") + "</p></div>" +
        '<div><p class="detail-item__label">Total quoted cost</p><p class="detail-item__value">' +
          (row ? fmtEur(row.totalQuotedCost) : "-") + "</p></div>" +
        '<div><p class="detail-item__label">Promised delivery</p><p class="detail-item__value">' +
          (chosen ? fmtDate(chosen.earliestDelivery) : "-") + "</p></div>" +
        '<div><p class="detail-item__label">Decision date</p><p class="detail-item__value">' +
          fmtDate(request.decision.decidedAt) + "</p></div>" +
        "</div>";

      const tradeOffs = [];
      if (row && row.costPremium !== null && row.costPremium > 0) {
        tradeOffs.push(
          "Costs " + fmtEur(row.costPremium) + " more than the lowest comparable quotation."
        );
      }
      if (request.decision.overrodeRecommendation) {
        tradeOffs.push("This was not the suggested lowest-cost option that met the date.");
      }
      if (request.decision.acceptedLateDelivery) {
        tradeOffs.push("A delivery after the required date was accepted.");
      }
      if (row && row.isLongestTerms) {
        tradeOffs.push("Longest payment terms of the comparable quotations.");
      }
      if (tradeOffs.length) {
        html += "<p style='margin-top:12px'><strong>Trade-offs:</strong> " + esc(tradeOffs.join(" ")) + "</p>";
      }

      html +=
        "<p style='margin-top:10px'><strong>Buyer rationale:</strong> " +
        esc(request.decision.rationale || "No reason recorded.") + "</p>";

      html += '<div class="button-row" style="margin-top:14px">';
      if (linkedOrder) {
        html +=
          '<button class="btn btn--secondary btn--sm" type="button" data-open-order="' +
          esc(linkedOrder.id) + '">Open ' + esc(linkedOrder.reference) + "</button>";
      } else {
        html +=
          '<button class="btn btn--primary btn--sm" type="button" data-create-po="' +
          esc(request.decision.quotationId) + '">Create purchase order</button>';
      }
      html +=
        '<button class="btn btn--ghost btn--sm" type="button" data-clear-decision="' +
        esc(request.id) + '">Change decision</button>';
      html += "</div></div>";

      return html;
    }

    if (comparison.validRows.length === 0) {
      return (
        '<p class="callout callout--warning" style="margin-top:16px">' +
        "No quotation can be selected yet. Every quotation is incomplete, expired, non-compliant, " +
        "or does not match the requested quantity, unit or minimum order." +
        "</p>"
      );
    }

    let html = '<h3 class="subhead">Record the decision</h3>';
    html += '<p class="hint" style="margin-bottom:10px">Choose any comparable quotation. ' +
      "A written reason is required if you do not take the suggested option, or if you accept a late delivery.</p>";
    html += '<div class="button-row">';
    comparison.validRows.forEach(function (row) {
      const label =
        "Select " + row.supplierName + " (" + fmtEur(row.totalQuotedCost) +
        (row.meetsDeadline === false ? ", " + row.daysLate + " days late" : "") + ")";
      html +=
        '<button class="btn ' + (row.isRecommended ? "btn--primary" : "btn--ghost") +
        ' btn--sm" type="button" data-select-quote="' + esc(row.quote.id) + '">' + esc(label) + "</button>";
    });
    html += "</div>";
    return html;
  }

  /* ---------- PURCHASE ORDERS ---------- */

  function filteredOrders() {
    const d = data();
    const search = ui.filters.search.trim().toLowerCase();

    return d.orders
      .filter(function (o) {
        if (search) {
          const hay = (
            o.reference + " " + (o.snapshot.supplierName || "") + " " + (o.snapshot.product || "")
          ).toLowerCase();
          if (hay.indexOf(search) === -1) return false;
        }

        if (ui.filters.status === "attention") {
          if (L.orderFlags(o).filter(function (f) { return f.code !== "draft"; }).length === 0) return false;
        } else if (ui.filters.status !== "all") {
          if (L.displayStatus(o) !== ui.filters.status) return false;
        }

        if (ui.filters.supplier !== "all" && o.supplierId !== ui.filters.supplier) return false;
        return true;
      })
      .sort(function (a, b) {
        return String(b.orderDate).localeCompare(String(a.orderDate));
      });
  }

  function statusBadge(status) {
    const key = status.toLowerCase().replace(/\s+/g, "");
    const map = {
      draft: "draft",
      ordered: "ordered",
      partiallyreceived: "partially",
      received: "received",
      cancelled: "cancelled"
    };
    return '<span class="badge badge--' + (map[key] || "draft") + '">' + esc(status) + "</span>";
  }

  function renderOrders() {
    const orders = filteredOrders();
    const d = data();

    el("ordersTableBody").innerHTML = orders
      .map(function (o) {
        const status = L.displayStatus(o);
        const received = L.receivedQuantity(o);
        const outstanding = L.outstandingQuantity(o);
        const flags = L.orderFlags(o).filter(function (f) { return f.code !== "draft"; });
        const alert = flags.some(function (f) { return f.severity === "critical"; });

        const flagHtml = flags
          .map(function (f) {
            return '<span class="chip chip--' + (f.severity === "critical" ? "critical" : "warning") +
              '" title="' + esc(f.detail) + '">' + esc(f.label) + "</span>";
          })
          .join("");

        return (
          '<tr class="' + (alert ? "row-alert" : "") + '">' +
          '<td class="ref">' + esc(o.reference) + "</td>" +
          "<td>" + esc(o.snapshot.supplierName || "") + "</td>" +
          "<td>" + esc(o.snapshot.product || "") + "</td>" +
          '<td class="num">' + fmtNum(o.quantityOrdered) + "</td>" +
          '<td class="num">' + fmtNum(received) + "</td>" +
          '<td class="num strong">' + fmtNum(outstanding) + "</td>" +
          "<td>" + fmtDate(o.requiredDate) + "</td>" +
          "<td>" + fmtDate(o.latestExpectedDate) + "</td>" +
          "<td>" + statusBadge(status) + (flagHtml ? "<br>" + flagHtml : "") + "</td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn--sm btn--ghost" type="button" data-open-order="' + esc(o.id) + '">Open</button>' +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");

    el("ordersEmpty").hidden = orders.length > 0;
    el("ordersCount").textContent =
      "Showing " + orders.length + " of " + d.orders.length + " orders";
  }

  /* The detail panel: everything secondary about one purchase order. */
  function openOrderDetail(orderId) {
    const order = data().orders.find(function (o) { return o.id === orderId; });
    if (!order) return;

    ui.activeOrderId = orderId;
    const status = L.displayStatus(order);
    const received = L.receivedQuantity(order);
    const outstanding = L.outstandingQuantity(order);
    const flags = L.orderFlags(order);
    const s = order.snapshot || {};

    el("poDetailTitle").textContent = order.reference + " - " + (s.supplierName || "");

    let html = "";

    if (flags.length) {
      html += flags
        .map(function (f) {
          const kind = f.severity === "critical" ? "danger" : f.severity === "warning" ? "warning" : "info";
          return '<p class="callout callout--' + kind + '"><strong>' + esc(f.label) + ".</strong> " + esc(f.detail) + "</p>";
        })
        .join("");
    }

    html +=
      '<div class="po-section">' +
      '<p class="po-section__title">Order</p>' +
      '<div class="detail-grid">' +
      detailItem("Status", statusBadge(status)) +
      detailItem("Supplier", esc(s.supplierName || "")) +
      detailItem("Product", esc(s.product || "")) +
      detailItem("Quantity ordered", fmtNum(order.quantityOrdered) + " " + esc(s.unit || "")) +
      detailItem("Received", fmtNum(received) + " " + esc(s.unit || "")) +
      detailItem("Outstanding", "<strong>" + fmtNum(outstanding) + " " + esc(s.unit || "") + "</strong>") +
      detailItem("Order date", fmtDate(order.orderDate)) +
      detailItem("Required delivery date", fmtDate(order.requiredDate)) +
      detailItem("Original confirmed date", fmtDate(order.confirmedDeliveryDate)) +
      detailItem("Latest expected date", fmtDate(order.latestExpectedDate)) +
      detailItem("Next follow-up", fmtDate(order.nextFollowUpDate)) +
      detailItem("Payment terms", s.paymentTermsDays ? s.paymentTermsDays + " days" : "Not recorded") +
      "</div></div>";

    // Frozen snapshot of the decision
    html +=
      '<div class="po-section">' +
      '<p class="po-section__title">Agreed price (snapshot taken when the order was created)</p>' +
      '<table class="mini-table"><tbody>' +
      "<tr><th>Specification</th><td>" + esc(s.specification || "") + "</td></tr>" +
      "<tr><th>Unit price</th><td class='num'>" + fmtEur(s.unitPrice) + "</td></tr>" +
      "<tr><th>Goods value</th><td class='num'>" + fmtEur(L.round2((Number(s.quantity) || 0) * (Number(s.unitPrice) || 0))) + "</td></tr>" +
      "<tr><th>Freight</th><td class='num'>" + fmtEur(s.freight) + "</td></tr>" +
      "<tr><th>Other charges</th><td class='num'>" + fmtEur(s.otherCharges) + "</td></tr>" +
      "<tr><th>Discount</th><td class='num'>&minus; " + fmtEur(s.discount) + "</td></tr>" +
      "<tr><th>Total quoted cost</th><td class='num'><strong>" + fmtEur(s.totalQuotedCost) + "</strong></td></tr>" +
      "<tr><th>Effective unit cost</th><td class='num'>" + fmtEur(s.effectiveUnitCost) + "</td></tr>" +
      "</tbody></table>" +
      '<p class="hint" style="margin-top:8px">' +
      "This snapshot is never changed by later edits to the supplier or quotation, so the original " +
      "decision stays readable." +
      "</p></div>";

    if (s.rationale) {
      html +=
        '<div class="po-section">' +
        '<p class="po-section__title">Why this supplier</p>' +
        "<p>" + esc(s.rationale) + "</p>" +
        (s.decidedAt ? '<p class="hint">Decision recorded ' + fmtDate(s.decidedAt) + "</p>" : "") +
        "</div>";
    }

    // Receipts
    html += '<div class="po-section"><p class="po-section__title">Goods receipts</p>';
    if (!order.receipts.length) {
      html += '<p class="hint">Nothing received yet.</p>';
    } else {
      html +=
        '<table class="mini-table"><thead><tr>' +
        "<th>Date</th><th class='num'>Quantity</th><th>Notes</th><th></th></tr></thead><tbody>" +
        order.receipts
          .slice()
          .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
          .map(function (r) {
            return (
              "<tr><td>" + fmtDate(r.date) + "</td>" +
              "<td class='num'>" + fmtNum(r.quantity) + "</td>" +
              "<td>" + esc(r.notes || "") + "</td>" +
              "<td class='num'>" +
              "<button class='btn btn--sm btn--ghost' type='button' data-edit-receipt='" + esc(r.id) + "'>Correct</button> " +
              "<button class='btn btn--sm btn--danger' type='button' data-delete-receipt='" + esc(r.id) + "'>Delete</button>" +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table>";
    }
    html += "</div>";

    // Follow-ups
    html += '<div class="po-section"><p class="po-section__title">Follow-up notes</p>';
    if (!order.followUps.length) {
      html += '<p class="hint">No follow-ups recorded.</p>';
    } else {
      html +=
        '<ul class="activity">' +
        order.followUps
          .slice()
          .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
          .map(function (f) {
            return "<li><time>" + fmtDate(f.date) + "</time>" + esc(f.note) + "</li>";
          })
          .join("") +
        "</ul>";
    }
    if (order.notes) {
      html += '<p class="hint" style="margin-top:10px"><strong>Order notes:</strong> ' + esc(order.notes) + "</p>";
    }
    html += "</div>";

    // Manual status control
    html +=
      '<div class="po-section"><p class="po-section__title">Order state</p>' +
      '<div class="button-row">' +
      (order.status === "Draft"
        ? '<button class="btn btn--secondary btn--sm" type="button" data-mark-ordered="' + esc(order.id) + '">Mark as Ordered</button>'
        : "") +
      (order.status !== "Cancelled"
        ? '<button class="btn btn--danger btn--sm" type="button" data-cancel-order="' + esc(order.id) + '">Cancel order</button>'
        : '<button class="btn btn--ghost btn--sm" type="button" data-reopen-order="' + esc(order.id) + '">Reopen order</button>') +
      '<button class="btn btn--danger btn--sm" type="button" data-delete-order="' + esc(order.id) + '">Delete order</button>' +
      "</div>" +
      '<p class="hint" style="margin-top:8px">"Ordered" only records that you placed this order. ' +
      "Nothing is emailed or sent to a supplier by this demo.</p></div>";

    el("poDetailBody").innerHTML = html;

    // Receiving is only sensible on a live order with something outstanding
    const canReceive = (status === "Ordered" || status === "Partially received") && outstanding > 0;
    el("poReceiveBtn").disabled = !canReceive;
    el("poFollowUpBtn").disabled = order.status === "Cancelled";

    el("poDetailDialog").showModal();
  }

  function detailItem(label, valueHtml) {
    return (
      '<div class="detail-item">' +
      '<p class="detail-item__label">' + label + "</p>" +
      '<p class="detail-item__value">' + valueHtml + "</p>" +
      "</div>"
    );
  }

  /* ---------- SUPPLIERS ---------- */

  function renderSuppliers() {
    const d = data();
    const sorted = d.suppliers.slice().sort(function (a, b) {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    el("suppliersCount").textContent =
      d.suppliers.filter(function (s) { return !s.archived; }).length + " active, " +
      d.suppliers.filter(function (s) { return s.archived; }).length + " archived";

    if (sorted.length === 0) {
      el("suppliersTableBody").innerHTML =
        '<tr><td colspan="9"><p class="empty">No suppliers yet. ' +
        "Add one with <strong>+ Add supplier</strong> before recording quotations.</p></td></tr>";
      return;
    }

    el("suppliersTableBody").innerHTML = sorted
      .map(function (s) {
        const quoteCount = d.quotations.filter(function (q) { return q.supplierId === s.id; }).length;
        const orderCount = d.orders.filter(function (o) { return o.supplierId === s.id; }).length;
        const inUse = quoteCount + orderCount > 0;

        return (
          '<tr class="' + (s.archived ? "row-muted" : "") + '">' +
          '<td class="strong">' + esc(s.name) + "</td>" +
          '<td><span class="badge badge--country">' + esc(s.country) + "</span></td>" +
          "<td>" + esc(s.category) + "</td>" +
          '<td class="num">' + (L.isNumber(s.leadTimeDays) ? s.leadTimeDays + " days" : "-") + "</td>" +
          "<td>" + esc(s.paymentTerms || "-") + "</td>" +
          '<td class="num">' + quoteCount + "</td>" +
          '<td class="num">' + orderCount + "</td>" +
          "<td>" + (s.archived
            ? '<span class="badge badge--archived">Archived</span>'
            : '<span class="badge badge--ok">Active</span>') + "</td>" +
          '<td><div class="row-actions">' +
          '<button class="btn btn--sm btn--ghost" type="button" data-edit-supplier="' + esc(s.id) + '">Edit</button>' +
          (s.archived
            ? '<button class="btn btn--sm btn--ghost" type="button" data-unarchive-supplier="' + esc(s.id) + '">Restore</button>'
            : '<button class="btn btn--sm btn--ghost" type="button" data-archive-supplier="' + esc(s.id) + '">Archive</button>') +
          (inUse
            ? ""
            : '<button class="btn btn--sm btn--danger" type="button" data-delete-supplier="' + esc(s.id) + '">Delete</button>') +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderActivity() {
    const list = data().activity || [];
    el("activityList").innerHTML = list.length
      ? list
          .slice(0, 40)
          .map(function (a) {
            return "<li><time>" + fmtDate(a.at) + "</time>" + esc(a.text) + "</li>";
          })
          .join("")
      : "<li>No activity recorded yet.</li>";
  }

  function fillSupplierDropdowns() {
    const d = data();
    const active = d.suppliers
      .filter(function (s) { return !s.archived; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });

    const options = active
      .map(function (s) {
        return '<option value="' + esc(s.id) + '">' + esc(s.name) + " (" + esc(s.country) + ")</option>";
      })
      .join("");

    el("quoSupplier").innerHTML = '<option value="">Select a supplier</option>' + options;
    el("poSupplier").innerHTML = '<option value="">Select a supplier</option>' + options;

    const filter = el("orderSupplierFilter");
    const previous = ui.filters.supplier;
    filter.innerHTML =
      '<option value="all">All suppliers</option>' +
      d.suppliers
        .slice()
        .sort(function (a, b) { return a.name.localeCompare(b.name); })
        .map(function (s) {
          return '<option value="' + esc(s.id) + '">' + esc(s.name) + "</option>";
        })
        .join("");
    filter.value = d.suppliers.some(function (s) { return s.id === previous; }) ? previous : "all";
    ui.filters.supplier = filter.value;

    const categories = Array.from(new Set(d.suppliers.map(function (s) { return s.category; }))).sort();
    el("categoryList").innerHTML = categories
      .map(function (c) { return '<option value="' + esc(c) + '"></option>'; })
      .join("");
  }

  /* ============================================================
     FORM HELPERS
     ============================================================ */

  function setError(inputId, errorId, message) {
    const input = el(inputId);
    el(errorId).textContent = message || "";
    if (message) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  function clearErrors(form) {
    form.querySelectorAll(".error").forEach(function (p) { p.textContent = ""; });
    form.querySelectorAll("[aria-invalid]").forEach(function (i) { i.removeAttribute("aria-invalid"); });
  }

  /* Reads a number field. Returns null when the box is empty, so an
     empty box is never silently treated as zero. */
  function numberOrNull(id) {
    const raw = el(id).value.trim();
    if (raw === "") return null;
    const value = Number(raw);
    return isFinite(value) ? value : null;
  }

  function nextReference(prefix, existing) {
    const year = new Date().getFullYear();
    let highest = 0;
    const pattern = new RegExp("^" + prefix + "-\\d{4}-(\\d+)$");
    existing.forEach(function (item) {
      const match = pattern.exec(item);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > highest) highest = n;
      }
    });
    return prefix + "-" + year + "-" + String(highest + 1).padStart(4, "0");
  }

  /* ============================================================
     REQUEST FORM
     ============================================================ */

  let requestEditId = null;

  function openRequestDialog(requestId) {
    const form = el("requestForm");
    form.reset();
    clearErrors(form);
    requestEditId = requestId || null;

    if (requestId) {
      const r = data().requests.find(function (x) { return x.id === requestId; });
      if (!r) return;
      el("requestDialogTitle").textContent = "Edit " + r.reference;
      el("reqProduct").value = r.product;
      el("reqSpec").value = r.specification;
      el("reqQuantity").value = r.quantity;
      el("reqUnit").value = r.unit;
      el("reqRequiredDate").value = r.requiredDate;
      el("reqLocation").value = r.deliveryLocation;
      el("reqBudget").value = r.budget == null ? "" : r.budget;
      el("reqNotes").value = r.notes || "";
    } else {
      el("requestDialogTitle").textContent = "New purchasing request";
      el("reqUnit").value = "pcs";
      el("reqRequiredDate").value = "";
    }

    el("requestDialog").showModal();
    el("reqProduct").focus();
  }

  function submitRequest(event) {
    event.preventDefault();
    const form = el("requestForm");
    clearErrors(form);

    const product = el("reqProduct").value.trim();
    const spec = el("reqSpec").value.trim();
    const quantity = numberOrNull("reqQuantity");
    const unit = el("reqUnit").value.trim();
    const requiredDate = el("reqRequiredDate").value;
    const location = el("reqLocation").value.trim();
    const budget = numberOrNull("reqBudget");

    let firstBad = null;
    function fail(id, errId, msg) {
      setError(id, errId, msg);
      if (!firstBad) firstBad = el(id);
    }

    if (!product) fail("reqProduct", "reqProductErr", "Enter the product name.");
    if (!spec) fail("reqSpec", "reqSpecErr", "Enter the specification suppliers must quote against.");
    if (quantity === null || quantity <= 0) fail("reqQuantity", "reqQuantityErr", "Quantity must be greater than zero.");
    if (!unit) fail("reqUnit", "reqUnitErr", "Enter the unit of measure, for example pcs.");
    if (!requiredDate) fail("reqRequiredDate", "reqRequiredDateErr", "Choose the date the goods are needed.");
    if (!location) fail("reqLocation", "reqLocationErr", "Enter where the goods must be delivered.");

    if (firstBad) {
      firstBad.focus();
      return;
    }

    const d = data();

    if (requestEditId) {
      const r = d.requests.find(function (x) { return x.id === requestEditId; });
      const unitChanged = r.unit !== unit;
      const quantityChanged = r.quantity !== quantity;

      r.product = product;
      r.specification = spec;
      r.quantity = quantity;
      r.unit = unit;
      r.requiredDate = requiredDate;
      r.deliveryLocation = location;
      r.budget = budget;
      r.notes = el("reqNotes").value.trim();

      store.logActivity("Request " + r.reference + " edited.");
      if (unitChanged || quantityChanged) {
        toast("Request updated. Quotations were re-checked against the new quantity and unit.");
      } else {
        toast("Request " + r.reference + " updated.");
      }
    } else {
      const reference = nextReference("REQ", d.requests.map(function (r) { return r.reference; }));
      d.requests.push({
        id: newId("req"),
        reference: reference,
        product: product,
        specification: spec,
        quantity: quantity,
        unit: unit,
        requiredDate: requiredDate,
        deliveryLocation: location,
        budget: budget,
        notes: el("reqNotes").value.trim(),
        createdAt: L.today(),
        decision: null
      });
      store.logActivity("Request " + reference + " created.");
      toast("Request " + reference + " created.");
    }

    store.save();
    render();
    el("requestDialog").close();
  }

  /* ============================================================
     QUOTATION FORM
     ============================================================ */

  let quotationRequestId = null;

  function openQuotationDialog(requestId, quotationId) {
    const d = data();
    const form = el("quotationForm");
    form.reset();
    clearErrors(form);

    quotationRequestId = requestId;
    ui.quotationEditId = quotationId || null;

    const request = d.requests.find(function (r) { return r.id === requestId; });
    if (!request) return;

    el("quoteRequestContext").innerHTML =
      "<strong>" + esc(request.reference) + "</strong> &mdash; " + esc(request.product) +
      ". Requested: <strong>" + fmtNum(request.quantity) + " " + esc(request.unit) +
      "</strong>, required by <strong>" + fmtDate(request.requiredDate) + "</strong>.<br>" +
      "Specification: " + esc(request.specification);

    if (quotationId) {
      const q = d.quotations.find(function (x) { return x.id === quotationId; });
      if (!q) return;
      el("quotationDialogTitle").textContent = "Edit quotation";
      el("quoSupplier").value = q.supplierId;
      el("quoCompliant").value = q.compliant === false ? "no" : "yes";
      el("quoSpec").value = q.quotedSpec;
      el("quoQuantity").value = q.quantity;
      el("quoUnit").value = q.unit;
      el("quoUnitPrice").value = q.unitPrice == null ? "" : q.unitPrice;
      el("quoFreight").value = q.freight == null ? "" : q.freight;
      el("quoOther").value = q.otherCharges == null ? "" : q.otherCharges;
      el("quoDiscount").value = q.discount == null ? "" : q.discount;
      el("quoDelivery").value = q.earliestDelivery || "";
      el("quoValidUntil").value = q.validUntil || "";
      el("quoMinOrder").value = q.minOrderQuantity == null ? "" : q.minOrderQuantity;
      el("quoPaymentTerms").value = q.paymentTermsDays == null ? "" : q.paymentTermsDays;
      el("quoNotes").value = q.notes || "";
    } else {
      el("quotationDialogTitle").textContent = "Add quotation";
      // Pre-fill the parts that must match the request, so like-for-like is the default
      el("quoSpec").value = request.specification;
      el("quoQuantity").value = request.quantity;
      el("quoUnit").value = request.unit;
      el("quoFreight").value = "0";
      el("quoOther").value = "0";
      el("quoDiscount").value = "0";
    }

    updateQuotePreview();
    el("quotationDialog").showModal();
    el("quoSupplier").focus();
  }

  function updateQuotePreview() {
    const quantity = numberOrNull("quoQuantity");
    const unitPrice = numberOrNull("quoUnitPrice");
    const freight = numberOrNull("quoFreight");
    const other = numberOrNull("quoOther");
    const discount = numberOrNull("quoDiscount");

    const missing = [];
    if (quantity === null) missing.push("quantity");
    if (unitPrice === null) missing.push("unit price");
    if (freight === null) missing.push("freight");
    if (other === null) missing.push("other charges");
    if (discount === null) missing.push("discount");

    if (missing.length) {
      el("quotePreview").innerHTML =
        "<strong>Total cannot be calculated yet.</strong> Still needed: " + esc(missing.join(", ")) +
        ". An empty box is treated as missing, not as zero.";
      return;
    }

    const goods = L.round2(quantity * unitPrice);
    const total = L.round2(goods + freight + other - discount);
    const perUnit = quantity > 0 ? L.round2(total / quantity) : null;

    el("quotePreview").innerHTML =
      "<strong>Total quoted cost: " + fmtEur(total) + "</strong><br>" +
      fmtNum(quantity) + " &times; " + fmtEur(unitPrice) + " = " + fmtEur(goods) +
      " + freight " + fmtEur(freight) +
      " + other " + fmtEur(other) +
      " &minus; discount " + fmtEur(discount) + "<br>" +
      "Effective unit cost: " + fmtEur(perUnit) + " (EUR excl. VAT)";
  }

  function submitQuotation(event) {
    event.preventDefault();
    const form = el("quotationForm");
    clearErrors(form);

    const supplierId = el("quoSupplier").value;
    const spec = el("quoSpec").value.trim();
    const quantity = numberOrNull("quoQuantity");
    const unit = el("quoUnit").value.trim();
    const unitPrice = numberOrNull("quoUnitPrice");
    const freight = numberOrNull("quoFreight");
    const other = numberOrNull("quoOther");
    const discount = numberOrNull("quoDiscount");
    const delivery = el("quoDelivery").value;

    let firstBad = null;
    function fail(id, errId, msg) {
      setError(id, errId, msg);
      if (!firstBad) firstBad = el(id);
    }

    if (!supplierId) fail("quoSupplier", "quoSupplierErr", "Choose the supplier who gave this quotation.");
    if (!spec) fail("quoSpec", "quoSpecErr", "Record what the supplier actually quoted.");
    if (quantity === null || quantity <= 0) fail("quoQuantity", "quoQuantityErr", "Enter the quantity quoted.");
    if (!unit) fail("quoUnit", "quoUnitErr", "Enter the unit the supplier quoted in.");
    if (unitPrice === null || unitPrice < 0) fail("quoUnitPrice", "quoUnitPriceErr", "Enter the unit price. It cannot be negative.");
    if (freight === null || freight < 0) fail("quoFreight", "quoFreightErr", "Enter freight. Use 0 if it is included.");
    if (other === null || other < 0) fail("quoOther", "quoOtherErr", "Enter other charges. Use 0 if there are none.");
    if (discount === null || discount < 0) fail("quoDiscount", "quoDiscountErr", "Enter the discount. Use 0 if there is none.");
    if (!delivery) fail("quoDelivery", "quoDeliveryErr", "Enter the earliest date the supplier can deliver.");

    if (firstBad) {
      firstBad.focus();
      return;
    }

    const d = data();
    const record = {
      requestId: quotationRequestId,
      supplierId: supplierId,
      quotedSpec: spec,
      compliant: el("quoCompliant").value === "yes",
      quantity: quantity,
      unit: unit,
      unitPrice: unitPrice,
      freight: freight,
      otherCharges: other,
      discount: discount,
      earliestDelivery: delivery,
      validUntil: el("quoValidUntil").value || null,
      minOrderQuantity: numberOrNull("quoMinOrder"),
      paymentTermsDays: numberOrNull("quoPaymentTerms"),
      notes: el("quoNotes").value.trim()
    };

    const supplierName = (d.suppliers.find(function (s) { return s.id === supplierId; }) || {}).name || "supplier";

    if (ui.quotationEditId) {
      const existing = d.quotations.find(function (q) { return q.id === ui.quotationEditId; });
      Object.assign(existing, record);
      store.logActivity("Quotation from " + supplierName + " edited.");
      toast("Quotation updated.");
    } else {
      record.id = newId("quo");
      record.createdAt = L.today();
      d.quotations.push(record);
      store.logActivity("Quotation from " + supplierName + " added.");
      toast("Quotation from " + supplierName + " added.");
    }

    store.save();
    render();
    el("quotationDialog").close();
  }

  /* ============================================================
     DECISION
     ============================================================ */

  function openDecisionDialog(quotationId) {
    const d = data();
    const quote = d.quotations.find(function (q) { return q.id === quotationId; });
    if (!quote) return;

    const request = d.requests.find(function (r) { return r.id === quote.requestId; });
    const comparison = L.compareRequest(request, d.quotations);
    const row = comparison.rows.find(function (r) { return r.quote.id === quotationId; });

    ui.decisionQuoteId = quotationId;

    const overriding = Boolean(comparison.recommended) && comparison.recommended.quote.id !== quotationId;
    const late = row.meetsDeadline === false;
    const reasonRequired = overriding || late;

    let context =
      '<div class="callout callout--info">' +
      "<strong>" + esc(row.supplierName) + "</strong> &mdash; total quoted cost " +
      "<strong>" + fmtEur(row.totalQuotedCost) + "</strong>, effective unit cost " +
      fmtEur(row.effectiveUnitCost) + ".<br>" +
      "Earliest delivery " + fmtDate(quote.earliestDelivery) +
      ", required by " + fmtDate(request.requiredDate) + "." +
      "</div>";

    if (comparison.recommended && !overriding && !late) {
      context +=
        '<p class="callout callout--ok">This is the suggested option: the lowest total quoted cost ' +
        "among the comparable quotations that meet the required date.</p>";
    }

    if (overriding) {
      const rec = comparison.recommended;
      const difference = L.round2(row.totalQuotedCost - rec.totalQuotedCost);
      context +=
        '<p class="callout callout--warning"><strong>This is not the suggested option.</strong> ' +
        esc(rec.supplierName) + " quoted " + fmtEur(rec.totalQuotedCost) + " and also meets the date. " +
        "Quoted cost difference: " + (difference >= 0 ? "+" : "") + fmtEur(difference) + ". " +
        "Please record why you are choosing differently.</p>";
    }

    if (late) {
      context +=
        '<p class="callout callout--danger"><strong>This delivery is late.</strong> ' +
        "Earliest delivery " + fmtDate(quote.earliestDelivery) + " is " + row.daysLate +
        " days after the required date of " + fmtDate(request.requiredDate) +
        ". Please record why a late delivery is acceptable.</p>";
    }

    el("decisionContext").innerHTML = context;
    el("decRationale").value = "";
    el("decRationaleReq").hidden = !reasonRequired;
    el("decRationaleHint").textContent = reasonRequired
      ? "A reason is required because you are overriding the suggestion or accepting a late delivery."
      : "Optional, but a short reason is what makes the decision defensible later.";
    setError("decRationale", "decRationaleErr", "");

    el("decisionDialog").showModal();
    el("decRationale").focus();
  }

  function submitDecision(event) {
    event.preventDefault();
    const d = data();
    const quote = d.quotations.find(function (q) { return q.id === ui.decisionQuoteId; });
    if (!quote) return;

    const request = d.requests.find(function (r) { return r.id === quote.requestId; });
    const comparison = L.compareRequest(request, d.quotations);
    const row = comparison.rows.find(function (r) { return r.quote.id === quote.id; });

    const overriding = Boolean(comparison.recommended) && comparison.recommended.quote.id !== quote.id;
    const late = row.meetsDeadline === false;
    const reasonRequired = overriding || late;
    const rationale = el("decRationale").value.trim();

    if (reasonRequired && rationale.length < 10) {
      setError(
        "decRationale",
        "decRationaleErr",
        "Please write at least a short sentence explaining this choice (10 characters or more)."
      );
      el("decRationale").focus();
      return;
    }

    request.decision = {
      quotationId: quote.id,
      decidedAt: L.today(),
      rationale: rationale || "Suggested option taken: lowest total quoted cost meeting the required date.",
      overrodeRecommendation: overriding,
      acceptedLateDelivery: late
    };

    store.logActivity(
      "Decision recorded for " + request.reference + ": " + row.supplierName +
      " at " + fmtEur(row.totalQuotedCost) + (overriding ? " (suggestion overridden)" : "") +
      (late ? " (late delivery accepted)" : "")
    );
    store.save();
    render();
    el("decisionDialog").close();
    toast("Decision recorded for " + request.reference + ".");
  }

  /* ============================================================
     PURCHASE ORDER FORM
     ============================================================ */

  function openOrderDialog(fromQuotationId) {
    const d = data();
    const form = el("orderForm");
    form.reset();
    clearErrors(form);

    ui.orderFromQuotationId = fromQuotationId || null;
    el("poReference").value = nextReference("PO", d.orders.map(function (o) { return o.reference; }));
    el("poOrderDate").value = L.today();
    el("poStatus").value = "Ordered";

    if (fromQuotationId) {
      const quote = d.quotations.find(function (q) { return q.id === fromQuotationId; });
      const request = d.requests.find(function (r) { return r.id === quote.requestId; });
      const row = L.evaluateQuotation(quote, request);

      el("orderDialogTitle").textContent = "Create purchase order from quotation";
      el("manualOrderFields").hidden = true;
      el("orderFormContext").innerHTML =
        '<p class="callout callout--info">' +
        "Created from <strong>" + esc(request.reference) + "</strong> and the accepted quotation from " +
        "<strong>" + esc(row.supplierName) + "</strong>.<br>" +
        fmtNum(quote.quantity) + " " + esc(quote.unit) + " at " + fmtEur(quote.unitPrice) +
        " each, total quoted cost <strong>" + fmtEur(row.totalQuotedCost) + "</strong>. " +
        "These details are copied across and frozen, so you do not retype them." +
        "</p>";

      el("poRequiredDate").value = request.requiredDate;
      el("poConfirmedDate").value = quote.earliestDelivery || "";
    } else {
      el("orderDialogTitle").textContent = "New purchase order";
      el("manualOrderFields").hidden = false;
      el("orderFormContext").innerHTML =
        '<p class="callout callout--warning">' +
        "This order is being recorded without a sourcing comparison, so no decision rationale will be " +
        "stored against it. Use <strong>Sourcing</strong> when you want the comparison on record." +
        "</p>";
      el("poFreight").value = "0";
      updateManualOrderTotal();
    }

    el("orderDialog").showModal();
    el("poReference").focus();
  }

  function updateManualOrderTotal() {
    const quantity = numberOrNull("poQuantity");
    const price = numberOrNull("poUnitPrice");
    const freight = numberOrNull("poFreight");
    if (quantity === null || price === null || freight === null) {
      el("poTotalPreview").textContent = "Incomplete";
      return;
    }
    el("poTotalPreview").textContent = fmtEur(L.round2(quantity * price + freight));
  }

  function submitOrder(event) {
    event.preventDefault();
    const form = el("orderForm");
    clearErrors(form);
    const d = data();

    const reference = el("poReference").value.trim();
    const orderDate = el("poOrderDate").value;
    const requiredDate = el("poRequiredDate").value;
    const confirmedDate = el("poConfirmedDate").value || null;

    let firstBad = null;
    function fail(id, errId, msg) {
      setError(id, errId, msg);
      if (!firstBad) firstBad = el(id);
    }

    if (!reference) {
      fail("poReference", "poReferenceErr", "Enter a PO reference.");
    } else if (d.orders.some(function (o) { return o.reference.toLowerCase() === reference.toLowerCase(); })) {
      fail("poReference", "poReferenceErr", "That PO reference is already used.");
    }
    if (!orderDate) fail("poOrderDate", "poOrderDateErr", "Choose the order date.");
    if (!requiredDate) fail("poRequiredDate", "poRequiredDateErr", "Choose the required delivery date.");

    let snapshot = null;
    let supplierId = null;
    let quantityOrdered = 0;
    let requestId = null;
    let quotationId = null;

    if (ui.orderFromQuotationId) {
      const quote = d.quotations.find(function (q) { return q.id === ui.orderFromQuotationId; });
      if (!quote) return;

      // Guard against creating a second order from the same quotation.
      const duplicate = d.orders.find(function (o) { return o.quotationId === quote.id; });
      if (duplicate) {
        el("orderDialog").close();
        toast("A purchase order already exists for that quotation (" + duplicate.reference + ").");
        return;
      }

      const request = d.requests.find(function (r) { return r.id === quote.requestId; });
      const row = L.evaluateQuotation(quote, request);

      supplierId = quote.supplierId;
      quantityOrdered = quote.quantity;
      requestId = request.id;
      quotationId = quote.id;

      snapshot = {
        supplierName: row.supplierName,
        product: request.product,
        specification: quote.quotedSpec,
        unit: quote.unit,
        quantity: quote.quantity,
        unitPrice: quote.unitPrice,
        freight: quote.freight,
        otherCharges: quote.otherCharges,
        discount: quote.discount,
        totalQuotedCost: row.totalQuotedCost,
        effectiveUnitCost: row.effectiveUnitCost,
        paymentTermsDays: quote.paymentTermsDays,
        rationale: request.decision ? request.decision.rationale : "",
        decidedAt: request.decision ? request.decision.decidedAt : null
      };
    } else {
      supplierId = el("poSupplier").value;
      const product = el("poProduct").value.trim();
      const quantity = numberOrNull("poQuantity");
      const unit = el("poUnit").value.trim();
      const price = numberOrNull("poUnitPrice");
      const freight = numberOrNull("poFreight");

      if (!supplierId) fail("poSupplier", "poSupplierErr", "Choose a supplier.");
      if (!product) fail("poProduct", "poProductErr", "Enter the product.");
      if (quantity === null || quantity <= 0) fail("poQuantity", "poQuantityErr", "Enter the quantity ordered.");
      if (!unit) fail("poUnit", "poUnitErr", "Enter the unit.");
      if (price === null || price < 0) fail("poUnitPrice", "poUnitPriceErr", "Enter the unit price.");
      if (freight === null || freight < 0) fail("poFreight", "poFreightErr", "Enter freight. Use 0 if none.");

      if (!firstBad) {
        const total = L.round2(quantity * price + freight);
        const supplier = d.suppliers.find(function (s) { return s.id === supplierId; });
        quantityOrdered = quantity;
        snapshot = {
          supplierName: supplier ? supplier.name : "Unknown supplier",
          product: product,
          specification: "Recorded directly without a formal sourcing comparison.",
          unit: unit,
          quantity: quantity,
          unitPrice: price,
          freight: freight,
          otherCharges: 0,
          discount: 0,
          totalQuotedCost: total,
          effectiveUnitCost: L.round2(total / quantity),
          paymentTermsDays: numberOrNull("poPaymentTerms"),
          rationale: "Direct purchase, no comparison recorded.",
          decidedAt: null
        };
      }
    }

    if (firstBad) {
      firstBad.focus();
      return;
    }

    const order = {
      id: newId("po"),
      reference: reference,
      requestId: requestId,
      quotationId: quotationId,
      supplierId: supplierId,
      snapshot: snapshot,
      orderDate: orderDate,
      requiredDate: requiredDate,
      confirmedDeliveryDate: confirmedDate,
      latestExpectedDate: confirmedDate,
      quantityOrdered: quantityOrdered,
      status: el("poStatus").value,
      receipts: [],
      followUps: [],
      nextFollowUpDate: el("poFollowUpDate").value || null,
      notes: el("poNotes").value.trim(),
      createdAt: L.today()
    };

    d.orders.push(order);
    store.logActivity("Purchase order " + reference + " created for " + snapshot.supplierName + ".");
    store.save();
    render();
    el("orderDialog").close();
    toast("Purchase order " + reference + " created.");
    switchView("orders");
  }

  /* ============================================================
     RECEIPTS AND FOLLOW-UPS
     ============================================================ */

  function openReceiptDialog(orderId, receiptId) {
    const order = data().orders.find(function (o) { return o.id === orderId; });
    if (!order) return;

    const form = el("receiptForm");
    form.reset();
    clearErrors(form);

    ui.activeOrderId = orderId;
    ui.receiptEditId = receiptId || null;

    const outstanding = L.outstandingQuantity(order);
    const unit = order.snapshot.unit || "units";

    el("receiptDialogTitle").textContent = receiptId ? "Correct goods receipt" : "Record goods receipt";
    el("receiptContext").innerHTML =
      '<p class="callout callout--info"><strong>' + esc(order.reference) + "</strong> &mdash; " +
      esc(order.snapshot.product || "") + "<br>" +
      "Ordered " + fmtNum(order.quantityOrdered) + " " + esc(unit) +
      ", already received " + fmtNum(L.receivedQuantity(order)) + " " + esc(unit) +
      ", outstanding <strong>" + fmtNum(outstanding) + " " + esc(unit) + "</strong>.</p>";

    if (receiptId) {
      const r = order.receipts.find(function (x) { return x.id === receiptId; });
      if (r) {
        el("recDate").value = r.date;
        el("recQuantity").value = r.quantity;
        el("recNotes").value = r.notes || "";
      }
    } else {
      el("recDate").value = L.today();
      el("recQuantity").value = "";
    }

    el("receiptDialog").showModal();
    el("recQuantity").focus();
  }

  function submitReceipt(event) {
    event.preventDefault();
    const form = el("receiptForm");
    clearErrors(form);

    const order = data().orders.find(function (o) { return o.id === ui.activeOrderId; });
    if (!order) return;

    const date = el("recDate").value;
    const quantity = numberOrNull("recQuantity");

    if (!date) {
      setError("recDate", "recDateErr", "Enter the date the goods arrived.");
      el("recDate").focus();
      return;
    }

    const check = L.validateReceipt(order, quantity, date, ui.receiptEditId);
    if (!check.ok) {
      setError("recQuantity", "recQuantityErr", check.message);
      el("recQuantity").focus();
      return;
    }

    const notes = el("recNotes").value.trim();

    if (ui.receiptEditId) {
      const receipt = order.receipts.find(function (r) { return r.id === ui.receiptEditId; });
      const wasQuantity = receipt.quantity;
      const wasDate = receipt.date;
      receipt.quantity = quantity;
      receipt.date = date;
      receipt.notes = notes;
      store.logActivity(
        "Receipt on " + order.reference + " corrected: " + fmtNum(wasQuantity) + " on " + wasDate +
        " changed to " + fmtNum(quantity) + " on " + date + "."
      );
      toast("Receipt corrected. The change is in the local activity history.");
    } else {
      order.receipts.push({
        id: newId("rec"),
        date: date,
        quantity: quantity,
        notes: notes,
        recordedAt: L.today()
      });
      store.logActivity(
        "Received " + fmtNum(quantity) + " " + (order.snapshot.unit || "units") + " on " +
        order.reference + " (" + fmtNum(L.outstandingQuantity(order)) + " outstanding)."
      );
      toast(
        "Receipt recorded. Outstanding is now " + fmtNum(L.outstandingQuantity(order)) + " " +
        (order.snapshot.unit || "units") + "."
      );
    }

    store.save();
    render();
    el("receiptDialog").close();
    openOrderDetail(order.id);
  }

  function openFollowUpDialog(orderId) {
    const order = data().orders.find(function (o) { return o.id === orderId; });
    if (!order) return;

    const form = el("followUpForm");
    form.reset();
    clearErrors(form);
    ui.activeOrderId = orderId;

    el("followUpContext").innerHTML =
      '<p class="callout callout--info"><strong>' + esc(order.reference) + "</strong><br>" +
      "Original supplier-confirmed date: <strong>" + fmtDate(order.confirmedDeliveryDate) + "</strong> " +
      "(kept permanently).<br>" +
      "Latest expected date: <strong>" + fmtDate(order.latestExpectedDate) + "</strong>.</p>";

    el("fuDate").value = L.today();
    el("fuNewExpected").value = order.latestExpectedDate || "";
    el("followUpDialog").showModal();
    el("fuNote").focus();
  }

  function submitFollowUp(event) {
    event.preventDefault();
    const form = el("followUpForm");
    clearErrors(form);

    const order = data().orders.find(function (o) { return o.id === ui.activeOrderId; });
    if (!order) return;

    const date = el("fuDate").value;
    const note = el("fuNote").value.trim();

    let firstBad = null;
    if (!date) {
      setError("fuDate", "fuDateErr", "Enter the date of this follow-up.");
      firstBad = el("fuDate");
    }
    if (!note) {
      setError("fuNote", "fuNoteErr", "Write what happened, so the history is useful later.");
      if (!firstBad) firstBad = el("fuNote");
    }
    if (firstBad) {
      firstBad.focus();
      return;
    }

    order.followUps.push({ id: newId("fu"), date: date, note: note });

    const nextDate = el("fuNextDate").value;
    if (nextDate) order.nextFollowUpDate = nextDate;

    const newExpected = el("fuNewExpected").value;
    if (newExpected && newExpected !== order.latestExpectedDate) {
      const previous = order.latestExpectedDate;
      // Only the latest expectation moves. The confirmed date is untouched.
      order.latestExpectedDate = newExpected;
      store.logActivity(
        "Latest expected date on " + order.reference + " moved from " +
        (previous || "not set") + " to " + newExpected +
        ". Original confirmed date " + (order.confirmedDeliveryDate || "not set") + " unchanged."
      );
    }

    store.logActivity("Follow-up added to " + order.reference + ".");
    store.save();
    render();
    el("followUpDialog").close();
    openOrderDetail(order.id);
    toast("Follow-up saved.");
  }

  /* ============================================================
     SUPPLIER FORM
     ============================================================ */

  let supplierEditId = null;

  function openSupplierDialog(supplierId) {
    const form = el("supplierForm");
    form.reset();
    clearErrors(form);
    supplierEditId = supplierId || null;

    if (supplierId) {
      const s = data().suppliers.find(function (x) { return x.id === supplierId; });
      if (!s) return;
      el("supplierDialogTitle").textContent = "Edit supplier";
      el("supName").value = s.name;
      el("supCountry").value = s.country;
      el("supCategory").value = s.category;
      el("supLead").value = s.leadTimeDays == null ? "" : s.leadTimeDays;
      el("supTerms").value = s.paymentTerms || "Net 30";
      el("supNotes").value = s.notes || "";
    } else {
      el("supplierDialogTitle").textContent = "Add supplier";
      el("supTerms").value = "Net 30";
    }

    el("supplierDialog").showModal();
    el("supName").focus();
  }

  function submitSupplier(event) {
    event.preventDefault();
    const form = el("supplierForm");
    clearErrors(form);
    const d = data();

    const name = el("supName").value.trim();
    const country = el("supCountry").value.trim();
    const category = el("supCategory").value.trim();

    let firstBad = null;
    function fail(id, errId, msg) {
      setError(id, errId, msg);
      if (!firstBad) firstBad = el(id);
    }

    if (!name) {
      fail("supName", "supNameErr", "Enter the supplier name.");
    } else if (
      d.suppliers.some(function (s) {
        return s.id !== supplierEditId && s.name.toLowerCase() === name.toLowerCase();
      })
    ) {
      fail("supName", "supNameErr", "A supplier with that name already exists.");
    }
    if (!country) fail("supCountry", "supCountryErr", "Enter the country.");
    if (!category) fail("supCategory", "supCategoryErr", "Enter the product category.");

    if (firstBad) {
      firstBad.focus();
      return;
    }

    if (supplierEditId) {
      const s = d.suppliers.find(function (x) { return x.id === supplierEditId; });
      s.name = name;
      s.country = country;
      s.category = category;
      s.leadTimeDays = numberOrNull("supLead");
      s.paymentTerms = el("supTerms").value;
      s.notes = el("supNotes").value.trim();
      store.logActivity("Supplier " + name + " edited. Existing purchase order snapshots are unchanged.");
      toast("Supplier updated. Past orders keep their original details.");
    } else {
      d.suppliers.push({
        id: newId("sup"),
        name: name,
        country: country,
        category: category,
        indicativePrice: null,
        leadTimeDays: numberOrNull("supLead"),
        paymentTerms: el("supTerms").value,
        archived: false,
        notes: el("supNotes").value.trim()
      });
      store.logActivity("Supplier " + name + " added.");
      toast("Supplier " + name + " added.");
    }

    store.save();
    render();
    el("supplierDialog").close();
  }

  /* ============================================================
     CSV EXPORT
     ============================================================ */

  /* A cell starting with = + - @ or a control character can be run as a
     formula when the file is opened in a spreadsheet. Prefixing it with
     an apostrophe keeps it as text. */
  function csvCell(value) {
    let text = String(value == null ? "" : value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    if (/[",\n\r]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  async function exportOrdersToCsv() {
    const orders = filteredOrders();
    if (orders.length === 0) {
      toast("There are no orders to export.");
      return;
    }

    const d = data();
    const headers = [
      "PO reference", "Supplier", "Country", "Product", "Specification", "Unit",
      "Quantity ordered", "Quantity received", "Outstanding quantity",
      "Unit price EUR", "Freight EUR", "Other charges EUR", "Discount EUR",
      "Total quoted cost EUR", "Effective unit cost EUR", "Outstanding goods value EUR",
      "Payment terms days", "Order date", "Required date",
      "Original confirmed date", "Latest expected date",
      "Status", "Overdue", "Linked request", "Decision rationale"
    ];

    const rows = orders.map(function (o) {
      const supplier = d.suppliers.find(function (s) { return s.id === o.supplierId; });
      const request = d.requests.find(function (r) { return r.id === o.requestId; });
      const s = o.snapshot || {};
      const overdue = L.orderFlags(o).some(function (f) { return f.code === "overdue"; });

      return [
        o.reference,
        s.supplierName || "",
        supplier ? supplier.country : "",
        s.product || "",
        s.specification || "",
        s.unit || "",
        o.quantityOrdered,
        L.receivedQuantity(o),
        L.outstandingQuantity(o),
        s.unitPrice == null ? "" : Number(s.unitPrice).toFixed(4),
        s.freight == null ? "" : Number(s.freight).toFixed(2),
        s.otherCharges == null ? "" : Number(s.otherCharges).toFixed(2),
        s.discount == null ? "" : Number(s.discount).toFixed(2),
        s.totalQuotedCost == null ? "" : Number(s.totalQuotedCost).toFixed(2),
        s.effectiveUnitCost == null ? "" : Number(s.effectiveUnitCost).toFixed(4),
        L.outstandingValue(o).toFixed(2),
        s.paymentTermsDays == null ? "" : s.paymentTermsDays,
        o.orderDate,
        o.requiredDate,
        o.confirmedDeliveryDate || "",
        o.latestExpectedDate || "",
        L.displayStatus(o),
        overdue ? "Yes" : "No",
        request ? request.reference : "",
        s.rationale || ""
      ]
        .map(csvCell)
        .join(",");
    });

    const csv = "﻿" + [headers.map(csvCell).join(",")].concat(rows).join("\r\n");
    const saved = await saveFile(csv, "procureflow-purchase-orders-" + L.today() + ".csv", "text/csv;charset=utf-8;");
    toast(saved ? "Exported " + orders.length + " orders to CSV." : "Export cancelled.");
  }

  /* Hands a generated file to the user. On a normal computer this is an
     invisible download link. Inside a published Claude Artifact the page
     must ask permission first, which is what window.claude provides. */
  async function saveFile(text, filename, mimeType) {
    if (window.claude && typeof window.claude.use === "function") {
      try {
        const downloads = await window.claude.use("downloads");
        if (downloads) {
          await downloads.save({ filename: filename, data: text });
          return true;
        }
      } catch (error) {
        if (error && error.code === "declined") return false;
      }
    }

    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }

  /* ============================================================
     BACKUP / RESTORE / RESET
     ============================================================ */

  async function backupJson() {
    const saved = await saveFile(
      store.exportJson(),
      "procureflow-backup-" + L.today() + ".json",
      "application/json"
    );
    if (saved) {
      store.logActivity("Backup file created.");
      store.save();
      renderActivity();
      toast("Backup saved. Keep it somewhere outside the browser.");
    }
  }

  function handleRestoreFile(file) {
    const reader = new FileReader();

    reader.onerror = function () {
      toast("That file could not be read.");
    };

    reader.onload = function () {
      const result = store.validateImport(String(reader.result));

      if (!result.ok) {
        askConfirm(
          "Restore failed",
          '<p class="callout callout--danger">' + esc(result.message) + "</p>" +
          "<p>Nothing was changed. Your existing records are untouched.</p>",
          "Close",
          function () {},
          false
        );
        return;
      }

      const s = result.summary;
      const current = data();

      askConfirm(
        "Replace everything with this backup?",
        '<p class="callout callout--warning"><strong>This replaces all records currently in this browser.</strong> ' +
          "It cannot be undone.</p>" +
          "<p><strong>The backup contains:</strong><br>" +
          s.suppliers + " suppliers, " + s.requests + " requests, " +
          s.quotations + " quotations, " + s.orders + " purchase orders.</p>" +
          "<p><strong>You currently have:</strong><br>" +
          current.suppliers.length + " suppliers, " + current.requests.length + " requests, " +
          current.quotations.length + " quotations, " + current.orders.length + " purchase orders.</p>",
        "Replace my data",
        function () {
          store.applyImport(result.dataset);
          ui.selectedRequestId = null;
          render();
          toast("Data restored from the backup file.");
        }
      );
    };

    reader.readAsText(file);
  }

  function resetDemo() {
    askConfirm(
      "Reset demo data?",
      '<p class="callout callout--warning"><strong>Every request, quotation, purchase order, receipt ' +
        "and supplier you have added will be deleted</strong> and replaced with the original " +
        "demonstration records. Seeded dates will be rebuilt from today.</p>" +
        "<p>If you want to keep your current records, cancel and use <strong>Backup to JSON</strong> first.</p>",
      "Reset everything",
      function () {
        store.resetDemo();
        ui.selectedRequestId = null;
        ui.filters = { search: "", status: "all", supplier: "all" };
        el("orderSearch").value = "";
        el("orderStatusFilter").value = "all";
        render();
        switchView("overview");
        toast("Demo data reset.");
      }
    );
  }

  /* ============================================================
     PRINTING A PURCHASE ORDER
     ============================================================ */

  function printOrder(orderId) {
    const d = data();
    const order = d.orders.find(function (o) { return o.id === orderId; });
    if (!order) return;

    const s = order.snapshot || {};
    const supplier = d.suppliers.find(function (x) { return x.id === order.supplierId; });
    const request = d.requests.find(function (r) { return r.id === order.requestId; });

    el("printArea").innerHTML =
      '<div class="print-doc">' +
      "<h1>Purchase Order " + esc(order.reference) + "</h1>" +
      '<p class="print-meta">' +
      "ProcureFlow demonstration document. Fictional supplier and transaction. Not a real order.<br>" +
      "Order date: " + fmtDate(order.orderDate) +
      " &nbsp;|&nbsp; Status: " + esc(L.displayStatus(order)) +
      (request ? " &nbsp;|&nbsp; Request: " + esc(request.reference) : "") +
      "</p>" +

      "<table><tbody>" +
      "<tr><th>Supplier</th><td>" + esc(s.supplierName || "") +
        (supplier ? ", " + esc(supplier.country) : "") + "</td></tr>" +
      "<tr><th>Delivery location</th><td>" + esc(request ? request.deliveryLocation : "Not recorded") + "</td></tr>" +
      "<tr><th>Required delivery date</th><td>" + fmtDate(order.requiredDate) + "</td></tr>" +
      "<tr><th>Supplier-confirmed date</th><td>" + fmtDate(order.confirmedDeliveryDate) + "</td></tr>" +
      "<tr><th>Payment terms</th><td>" + (s.paymentTermsDays ? s.paymentTermsDays + " days" : "Not recorded") + "</td></tr>" +
      "</tbody></table>" +

      "<table><thead><tr>" +
      "<th>Description</th><th class='num'>Quantity</th><th class='num'>Unit price</th><th class='num'>Amount</th>" +
      "</tr></thead><tbody>" +
      "<tr><td>" + esc(s.product || "") + "<br><small>" + esc(s.specification || "") + "</small></td>" +
      "<td class='num'>" + fmtNum(order.quantityOrdered) + " " + esc(s.unit || "") + "</td>" +
      "<td class='num'>" + fmtEur(s.unitPrice) + "</td>" +
      "<td class='num'>" + fmtEur(L.round2((Number(s.quantity) || 0) * (Number(s.unitPrice) || 0))) + "</td></tr>" +
      "<tr><td colspan='3'>Freight</td><td class='num'>" + fmtEur(s.freight) + "</td></tr>" +
      "<tr><td colspan='3'>Other charges</td><td class='num'>" + fmtEur(s.otherCharges) + "</td></tr>" +
      "<tr><td colspan='3'>Discount</td><td class='num'>&minus; " + fmtEur(s.discount) + "</td></tr>" +
      "<tr><td colspan='3'><strong>Total (EUR, excl. VAT)</strong></td>" +
      "<td class='num'><strong>" + fmtEur(s.totalQuotedCost) + "</strong></td></tr>" +
      "</tbody></table>" +

      (s.rationale ? "<p><strong>Award reason:</strong> " + esc(s.rationale) + "</p>" : "") +
      (order.notes ? "<p><strong>Notes:</strong> " + esc(order.notes) + "</p>" : "") +

      '<p class="print-footer">' +
      "ProcureFlow &mdash; an AI-assisted procurement portfolio prototype by Assish Sapkota. " +
      "All organisations and transactions are fictional. Amounts exclude VAT. " +
      "Printed " + fmtDate(L.today()) + "." +
      "</p></div>";

    window.print();
  }

  /* ============================================================
     EVENTS
     ============================================================ */

  function attachEvents() {
    document.querySelectorAll(".nav__link").forEach(function (button) {
      button.addEventListener("click", function () {
        switchView(button.dataset.view);
      });
    });

    /* --- one delegated click handler for every data- action --- */
    document.addEventListener("click", function (event) {
      const target = event.target.closest("[data-open-request], [data-edit-request], [data-add-quote], " +
        "[data-edit-quote], [data-delete-quote], [data-select-quote], [data-create-po], " +
        "[data-clear-decision], [data-open-order], [data-attention-kind], [data-edit-receipt], " +
        "[data-delete-receipt], [data-mark-ordered], [data-cancel-order], [data-reopen-order], " +
        "[data-delete-order], [data-edit-supplier], [data-archive-supplier], " +
        "[data-unarchive-supplier], [data-delete-supplier]");
      if (!target) return;

      const ds = target.dataset;

      if (ds.openRequest) {
        ui.selectedRequestId = ui.selectedRequestId === ds.openRequest ? null : ds.openRequest;
        renderSourcing();
        return;
      }
      if (ds.editRequest) { openRequestDialog(ds.editRequest); return; }
      if (ds.addQuote) { openQuotationDialog(ds.addQuote, null); return; }
      if (ds.editQuote) {
        const q = data().quotations.find(function (x) { return x.id === ds.editQuote; });
        if (q) openQuotationDialog(q.requestId, q.id);
        return;
      }
      if (ds.deleteQuote) { confirmDeleteQuote(ds.deleteQuote); return; }
      if (ds.selectQuote) { openDecisionDialog(ds.selectQuote); return; }
      if (ds.createPo) { openOrderDialog(ds.createPo); return; }
      if (ds.clearDecision) { confirmClearDecision(ds.clearDecision); return; }
      if (ds.openOrder) {
        switchView("orders");
        openOrderDetail(ds.openOrder);
        return;
      }
      if (ds.attentionKind) {
        if (ds.attentionKind === "order") {
          switchView("orders");
          openOrderDetail(ds.attentionId);
        } else {
          ui.selectedRequestId = ds.attentionId;
          switchView("sourcing");
          renderSourcing();
          const detail = el("requestDetail");
          if (detail) detail.scrollIntoView({ block: "start" });
        }
        return;
      }
      if (ds.editReceipt) { openReceiptDialog(ui.activeOrderId, ds.editReceipt); return; }
      if (ds.deleteReceipt) { confirmDeleteReceipt(ds.deleteReceipt); return; }
      if (ds.markOrdered) { setOrderStatus(ds.markOrdered, "Ordered"); return; }
      if (ds.cancelOrder) { confirmCancelOrder(ds.cancelOrder); return; }
      if (ds.reopenOrder) { setOrderStatus(ds.reopenOrder, "Ordered"); return; }
      if (ds.deleteOrder) { confirmDeleteOrder(ds.deleteOrder); return; }
      if (ds.editSupplier) { openSupplierDialog(ds.editSupplier); return; }
      if (ds.archiveSupplier) { setSupplierArchived(ds.archiveSupplier, true); return; }
      if (ds.unarchiveSupplier) { setSupplierArchived(ds.unarchiveSupplier, false); return; }
      if (ds.deleteSupplier) { confirmDeleteSupplier(ds.deleteSupplier); return; }
    });

    // Filters
    el("orderSearch").addEventListener("input", function (e) {
      ui.filters.search = e.target.value;
      renderOrders();
    });
    el("orderStatusFilter").addEventListener("change", function (e) {
      ui.filters.status = e.target.value;
      renderOrders();
    });
    el("orderSupplierFilter").addEventListener("change", function (e) {
      ui.filters.supplier = e.target.value;
      renderOrders();
    });
    el("clearFiltersBtn").addEventListener("click", function () {
      ui.filters = { search: "", status: "all", supplier: "all" };
      el("orderSearch").value = "";
      el("orderStatusFilter").value = "all";
      el("orderSupplierFilter").value = "all";
      renderOrders();
    });

    // Top-level buttons
    el("newRequestBtn").addEventListener("click", function () { openRequestDialog(null); });
    el("newOrderBtn").addEventListener("click", function () { openOrderDialog(null); });
    el("newSupplierBtn").addEventListener("click", function () { openSupplierDialog(null); });
    el("exportCsvBtn").addEventListener("click", exportOrdersToCsv);
    el("backupBtn").addEventListener("click", backupJson);
    el("resetDemoBtn").addEventListener("click", resetDemo);

    el("restoreBtn").addEventListener("click", function () { el("restoreInput").click(); });
    el("restoreInput").addEventListener("change", function (e) {
      const file = e.target.files && e.target.files[0];
      if (file) handleRestoreFile(file);
      e.target.value = "";
    });

    // Demo shortcuts
    el("demoStep1").addEventListener("click", function () {
      const request = data().requests.find(function (r) { return r.reference === "REQ-2026-0001"; })
        || data().requests.find(function (r) { return !r.decision; });
      if (!request) { toast("No open request found. Reset the demo data to restore it."); return; }
      ui.selectedRequestId = request.id;
      switchView("sourcing");
      renderSourcing();
      el("requestDetail").scrollIntoView({ block: "start" });
    });
    el("demoStep2").addEventListener("click", function () { switchView("orders"); });
    el("demoStep3").addEventListener("click", function () {
      const order = data().orders.find(function (o) { return L.displayStatus(o) === "Partially received"; })
        || data().orders.find(L.isOpen);
      if (!order) { toast("No open order found. Reset the demo data to restore it."); return; }
      switchView("orders");
      openOrderDetail(order.id);
    });

    // Forms
    el("requestForm").addEventListener("submit", submitRequest);
    el("quotationForm").addEventListener("submit", submitQuotation);
    el("decisionForm").addEventListener("submit", submitDecision);
    el("orderForm").addEventListener("submit", submitOrder);
    el("receiptForm").addEventListener("submit", submitReceipt);
    el("followUpForm").addEventListener("submit", submitFollowUp);
    el("supplierForm").addEventListener("submit", submitSupplier);

    // Live calculation previews
    ["quoQuantity", "quoUnitPrice", "quoFreight", "quoOther", "quoDiscount"].forEach(function (id) {
      el(id).addEventListener("input", updateQuotePreview);
    });
    ["poQuantity", "poUnitPrice", "poFreight"].forEach(function (id) {
      el(id).addEventListener("input", updateManualOrderTotal);
    });

    // PO detail buttons
    el("poReceiveBtn").addEventListener("click", function () {
      el("poDetailDialog").close();
      openReceiptDialog(ui.activeOrderId, null);
    });
    el("poFollowUpBtn").addEventListener("click", function () {
      el("poDetailDialog").close();
      openFollowUpDialog(ui.activeOrderId);
    });
    el("poPrintBtn").addEventListener("click", function () { printOrder(ui.activeOrderId); });

    // Confirmation dialog
    el("confirmOkBtn").addEventListener("click", function () {
      const action = confirmAction;
      confirmAction = null;
      el("confirmDialog").close();
      if (action) action();
    });

    // Dialog closing
    document.querySelectorAll("[data-close-dialog]").forEach(function (button) {
      button.addEventListener("click", function () { button.closest("dialog").close(); });
    });
    document.querySelectorAll("dialog").forEach(function (dialog) {
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  /* ---------- confirmed actions ---------- */

  function confirmDeleteQuote(quoteId) {
    const d = data();
    const quote = d.quotations.find(function (q) { return q.id === quoteId; });
    if (!quote) return;

    const request = d.requests.find(function (r) { return r.id === quote.requestId; });
    const isChosen = request && request.decision && request.decision.quotationId === quoteId;
    const usedByOrder = d.orders.some(function (o) { return o.quotationId === quoteId; });

    if (usedByOrder) {
      toast("That quotation is linked to a purchase order and cannot be deleted.");
      return;
    }

    askConfirm(
      "Delete this quotation?",
      "<p>Quotation from <strong>" + esc(L.evaluateQuotation(quote, request).supplierName) +
        "</strong> will be removed from " + esc(request ? request.reference : "this request") + ".</p>" +
        (isChosen ? '<p class="callout callout--warning">This is the quotation the decision was based on. ' +
          "The recorded decision will be cleared too.</p>" : ""),
      "Delete quotation",
      function () {
        d.quotations = d.quotations.filter(function (q) { return q.id !== quoteId; });
        if (isChosen) request.decision = null;
        store.logActivity("Quotation deleted from " + (request ? request.reference : "a request") + ".");
        store.save();
        render();
        toast("Quotation deleted.");
      }
    );
  }

  function confirmClearDecision(requestId) {
    const d = data();
    const request = d.requests.find(function (r) { return r.id === requestId; });
    if (!request) return;

    const linkedOrder = d.orders.find(function (o) { return o.requestId === requestId; });
    if (linkedOrder) {
      toast("A purchase order (" + linkedOrder.reference + ") already exists. Cancel or delete it first.");
      return;
    }

    askConfirm(
      "Change the recorded decision?",
      "<p>The decision and its reason for <strong>" + esc(request.reference) +
        "</strong> will be cleared so you can choose again. The quotations are kept.</p>",
      "Clear the decision",
      function () {
        request.decision = null;
        store.logActivity("Decision cleared on " + request.reference + ".");
        store.save();
        render();
        toast("Decision cleared.");
      }
    );
  }

  function confirmDeleteReceipt(receiptId) {
    const order = data().orders.find(function (o) { return o.id === ui.activeOrderId; });
    if (!order) return;
    const receipt = order.receipts.find(function (r) { return r.id === receiptId; });
    if (!receipt) return;

    askConfirm(
      "Delete this goods receipt?",
      "<p><strong>" + fmtNum(receipt.quantity) + " " + esc(order.snapshot.unit || "units") +
        "</strong> received on " + fmtDate(receipt.date) + " will be removed. " +
        "The outstanding quantity and status will be recalculated.</p>",
      "Delete receipt",
      function () {
        order.receipts = order.receipts.filter(function (r) { return r.id !== receiptId; });
        store.logActivity(
          "Receipt of " + fmtNum(receipt.quantity) + " on " + order.reference + " deleted."
        );
        store.save();
        render();
        openOrderDetail(order.id);
        toast("Receipt deleted.");
      }
    );
  }

  function setOrderStatus(orderId, status) {
    const order = data().orders.find(function (o) { return o.id === orderId; });
    if (!order) return;
    order.status = status;
    store.logActivity("Purchase order " + order.reference + " set to " + status + ".");
    store.save();
    render();
    openOrderDetail(orderId);
    toast(order.reference + " set to " + status + ".");
  }

  function confirmCancelOrder(orderId) {
    const order = data().orders.find(function (o) { return o.id === orderId; });
    if (!order) return;
    const received = L.receivedQuantity(order);

    askConfirm(
      "Cancel this purchase order?",
      "<p><strong>" + esc(order.reference) + "</strong> will be marked Cancelled and will stop " +
        "counting towards open orders and outstanding value.</p>" +
        (received > 0
          ? '<p class="callout callout--warning">' + fmtNum(received) +
            " " + esc(order.snapshot.unit || "units") + " have already been received. " +
            "The receipts are kept for the record.</p>"
          : ""),
      "Cancel the order",
      function () {
        order.status = "Cancelled";
        store.logActivity("Purchase order " + order.reference + " cancelled.");
        store.save();
        render();
        openOrderDetail(orderId);
        toast(order.reference + " cancelled.");
      }
    );
  }

  function confirmDeleteOrder(orderId) {
    const order = data().orders.find(function (o) { return o.id === orderId; });
    if (!order) return;

    askConfirm(
      "Delete this purchase order?",
      "<p><strong>" + esc(order.reference) + "</strong> and its " + order.receipts.length +
        " goods receipts will be permanently removed from this browser.</p>" +
        '<p class="callout callout--warning">Cancelling is usually better than deleting, because it ' +
        "keeps the history.</p>",
      "Delete permanently",
      function () {
        const d = data();
        d.orders = d.orders.filter(function (o) { return o.id !== orderId; });
        store.logActivity("Purchase order " + order.reference + " deleted.");
        store.save();
        el("poDetailDialog").close();
        render();
        toast(order.reference + " deleted.");
      }
    );
  }

  function setSupplierArchived(supplierId, archived) {
    const supplier = data().suppliers.find(function (s) { return s.id === supplierId; });
    if (!supplier) return;
    supplier.archived = archived;
    store.logActivity("Supplier " + supplier.name + (archived ? " archived." : " restored."));
    store.save();
    render();
    toast(
      supplier.name + (archived
        ? " archived. Existing records keep their history; the supplier no longer appears in new forms."
        : " restored.")
    );
  }

  function confirmDeleteSupplier(supplierId) {
    const d = data();
    const supplier = d.suppliers.find(function (s) { return s.id === supplierId; });
    if (!supplier) return;

    const quoteCount = d.quotations.filter(function (q) { return q.supplierId === supplierId; }).length;
    const orderCount = d.orders.filter(function (o) { return o.supplierId === supplierId; }).length;

    if (quoteCount + orderCount > 0) {
      toast(
        supplier.name + " is used by " + quoteCount + " quotations and " + orderCount +
        " orders, so it cannot be deleted. Archive it instead."
      );
      return;
    }

    askConfirm(
      "Delete this supplier?",
      "<p><strong>" + esc(supplier.name) + "</strong> is not used by any quotation or purchase order, " +
        "so it can be removed.</p>",
      "Delete supplier",
      function () {
        d.suppliers = d.suppliers.filter(function (s) { return s.id !== supplierId; });
        store.logActivity("Supplier " + supplier.name + " deleted.");
        store.save();
        render();
        toast(supplier.name + " deleted.");
      }
    );
  }

  /* ============================================================
     START-UP
     ============================================================ */

  function init() {
    store.load();
    renderStartupMessages();
    attachEvents();
    render();
    switchView("overview");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
