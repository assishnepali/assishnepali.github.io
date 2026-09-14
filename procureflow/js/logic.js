/* ============================================================
   ProcureFlow - calculations and rules
   ------------------------------------------------------------
   Every number the app shows is produced here, from stored records.
   Nothing is estimated, weighted or invented.

   The two formulas, stated once:

     Total quoted cost  = quantity x unit price
                          + freight + other charges - discount
     Effective unit cost = total quoted cost / quantity

   All amounts are EUR and exclude VAT. There is no currency
   conversion and no tax calculation in this version.

   All date comparisons are date-only ("YYYY-MM-DD" text compared
   directly). No times, no timezones.
   ============================================================ */

window.PF = window.PF || {};

PF.logic = (function () {
  "use strict";

  const MANUAL_STATUSES = ["Draft", "Ordered", "Cancelled"];

  /* ---------- money ----------
     Amounts are rounded to cents once, at the point they are
     calculated, so a total and its parts always agree on screen. */
  function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function today() {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  /* Whole days from date a to date b. Both are "YYYY-MM-DD". */
  function daysBetween(a, b) {
    if (!a || !b) return null;
    const from = new Date(a + "T12:00:00");
    const to = new Date(b + "T12:00:00");
    return Math.round((to - from) / 86400000);
  }

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /* Quotations store a supplier id; the readable name lives on the
     supplier record, so it is looked up whenever it is needed. */
  function supplierNameOf(supplierId) {
    const data = PF.store.get();
    const supplier =
      data &&
      data.suppliers.find(function (s) {
        return s.id === supplierId;
      });
    return supplier ? supplier.name : "Unknown supplier";
  }

  /* ============================================================
     QUOTATIONS
     ============================================================ */

  /* Works out the cost of one quotation and every reason it might
     not be usable. A missing amount is never treated as zero - the
     quotation is marked incomplete and gets no total at all.       */
  function evaluateQuotation(quote, request) {
    const problems = [];
    const missingFields = [];

    if (!isNumber(quote.unitPrice)) missingFields.push("unit price");
    if (!isNumber(quote.freight)) missingFields.push("freight");
    if (!isNumber(quote.otherCharges)) missingFields.push("other charges");
    if (!isNumber(quote.discount)) missingFields.push("discount");
    if (!isNumber(quote.quantity) || quote.quantity <= 0) missingFields.push("quantity");
    if (!quote.earliestDelivery) missingFields.push("earliest delivery date");

    const incomplete = missingFields.length > 0;
    if (incomplete) {
      problems.push({
        code: "incomplete",
        label: "Incomplete",
        detail: "Missing: " + missingFields.join(", ") + ". No total can be calculated."
      });
    }

    const expired = Boolean(quote.validUntil) && quote.validUntil < today();
    if (expired) {
      problems.push({
        code: "expired",
        label: "Expired",
        detail: "Quotation was valid until " + formatDate(quote.validUntil) + ". It must be re-requested."
      });
    }

    if (quote.compliant === false) {
      problems.push({
        code: "non-compliant",
        label: "Not compliant",
        detail: "The supplier did not confirm the requested specification."
      });
    }

    const unitMismatch = Boolean(request) && quote.unit !== request.unit;
    if (unitMismatch) {
      problems.push({
        code: "unit-mismatch",
        label: "Different unit",
        detail:
          "Quoted in " + quote.unit + " but the request is in " + request.unit +
          ". These cannot be compared."
      });
    }

    const quantityMismatch =
      Boolean(request) && isNumber(quote.quantity) && quote.quantity !== request.quantity;
    if (quantityMismatch) {
      problems.push({
        code: "quantity-mismatch",
        label: "Different quantity",
        detail:
          "Quoted for " + quote.quantity + " but the request is for " + request.quantity + "."
      });
    }

    const belowMinOrder =
      Boolean(request) &&
      isNumber(quote.minOrderQuantity) &&
      request.quantity < quote.minOrderQuantity;
    if (belowMinOrder) {
      problems.push({
        code: "min-order",
        label: "Below minimum order",
        detail:
          "Supplier's minimum order is " + quote.minOrderQuantity + " " + quote.unit +
          ", but only " + request.quantity + " are needed."
      });
    }

    // Costs are only calculated when every amount is actually present.
    let totalQuotedCost = null;
    let effectiveUnitCost = null;
    let goodsValue = null;

    if (!incomplete) {
      goodsValue = round2(quote.quantity * quote.unitPrice);
      totalQuotedCost = round2(
        goodsValue + quote.freight + quote.otherCharges - quote.discount
      );
      effectiveUnitCost = round2(totalQuotedCost / quote.quantity);
    }

    // Delivery against the requested date.
    let meetsDeadline = null;
    let daysLate = null;
    if (request && quote.earliestDelivery) {
      meetsDeadline = quote.earliestDelivery <= request.requiredDate;
      daysLate = meetsDeadline ? 0 : daysBetween(request.requiredDate, quote.earliestDelivery);
    }

    /* "Valid and compliant" means the quotation can honestly be
       compared. Being late does NOT make it invalid - lateness is a
       separate fact the buyer has to weigh.                        */
    const valid = !incomplete && !expired && quote.compliant !== false &&
      !unitMismatch && !quantityMismatch && !belowMinOrder;

    return {
      quote: quote,
      supplierName: supplierNameOf(quote.supplierId),
      problems: problems,
      incomplete: incomplete,
      expired: expired,
      nonCompliant: quote.compliant === false,
      unitMismatch: unitMismatch,
      quantityMismatch: quantityMismatch,
      belowMinOrder: belowMinOrder,
      valid: valid,
      goodsValue: goodsValue,
      totalQuotedCost: totalQuotedCost,
      effectiveUnitCost: effectiveUnitCost,
      meetsDeadline: meetsDeadline,
      daysLate: daysLate,
      eligible: valid && meetsDeadline === true
    };
  }

  /* ============================================================
     COMPARISON AND RECOMMENDATION
     ============================================================ */

  /* Builds the whole comparison for one request:
       - every quotation evaluated
       - which one is recommended, and in plain words why
       - the useful distinctions (cheapest, earliest, longest terms)
       - each quotation's cost premium against the cheapest valid
         compliant quotation

     There is no scoring and no weighting. The recommendation is
     simply: the lowest total quoted cost among the quotations that
     are valid, compliant AND can arrive by the required date.      */
  function compareRequest(request, quotations) {
    const rows = quotations
      .filter(function (q) {
        return q.requestId === request.id;
      })
      .map(function (q) {
        return evaluateQuotation(q, request);
      });

    const validRows = rows.filter(function (r) {
      return r.valid;
    });
    const eligibleRows = validRows.filter(function (r) {
      return r.eligible;
    });

    function lowestBy(list, pick) {
      let best = null;
      list.forEach(function (row) {
        const value = pick(row);
        if (value === null || value === undefined) return;
        if (best === null || value < pick(best)) best = row;
      });
      return best;
    }

    function highestBy(list, pick) {
      let best = null;
      list.forEach(function (row) {
        const value = pick(row);
        if (value === null || value === undefined) return;
        if (best === null || value > pick(best)) best = row;
      });
      return best;
    }

    // Baseline for the cost premium: cheapest VALID COMPLIANT quote,
    // whether or not it can meet the deadline.
    const cheapestValid = lowestBy(validRows, function (r) {
      return r.totalQuotedCost;
    });
    const earliestValid = lowestBy(validRows, function (r) {
      return r.quote.earliestDelivery;
    });
    const longestTerms = highestBy(validRows, function (r) {
      return isNumber(r.quote.paymentTermsDays) ? r.quote.paymentTermsDays : null;
    });

    const recommended = lowestBy(eligibleRows, function (r) {
      return r.totalQuotedCost;
    });

    // Cost premium for each row, against the cheapest valid compliant quote.
    const baseline = cheapestValid ? cheapestValid.totalQuotedCost : null;
    rows.forEach(function (row) {
      row.costPremium =
        baseline !== null && row.totalQuotedCost !== null
          ? round2(row.totalQuotedCost - baseline)
          : null;
      row.isCheapestValid = Boolean(cheapestValid) && row === cheapestValid;
      row.isEarliest = Boolean(earliestValid) && row === earliestValid;
      row.isLongestTerms = Boolean(longestTerms) && row === longestTerms;
      row.isRecommended = Boolean(recommended) && row === recommended;
    });

    // Plain-English explanation using the real numbers.
    let explanation;
    if (rows.length === 0) {
      explanation = "No quotations have been recorded for this request yet.";
    } else if (validRows.length === 0) {
      explanation =
        "None of the " + rows.length + " quotations can be compared. " +
        "Each one is incomplete, expired, non-compliant, or does not match the requested " +
        "quantity, unit or minimum order.";
    } else if (!recommended) {
      const late = cheapestValid;
      explanation =
        "No quotation can meet the required delivery date of " + formatDate(request.requiredDate) + ". " +
        "The lowest-cost comparable quotation is " + late.supplierName + " at " +
        formatEur(late.totalQuotedCost) + ", but its earliest delivery is " +
        formatDate(late.quote.earliestDelivery) + ", which is " + late.daysLate +
        " days late. Either the required date has to move, or a late delivery has to be " +
        "accepted with a recorded reason.";
    } else {
      const parts = [];
      parts.push(
        recommended.supplierName + " has the lowest total quoted cost (" +
        formatEur(recommended.totalQuotedCost) + ") among the quotations that are complete, " +
        "compliant and able to deliver by " + formatDate(request.requiredDate) + "."
      );

      const others = eligibleRows.filter(function (r) {
        return r !== recommended;
      });
      others.forEach(function (r) {
        parts.push(
          r.supplierName + " would cost " +
          formatEur(round2(r.totalQuotedCost - recommended.totalQuotedCost)) + " more (" +
          formatEur(r.totalQuotedCost) + ")."
        );
      });

      if (cheapestValid && cheapestValid !== recommended) {
        parts.push(
          cheapestValid.supplierName + " is cheaper overall at " +
          formatEur(cheapestValid.totalQuotedCost) + " (" +
          formatEur(Math.abs(recommended.costPremium)) + " less), but its earliest delivery is " +
          formatDate(cheapestValid.quote.earliestDelivery) + " - " + cheapestValid.daysLate +
          " days after the required date."
        );
      }

      explanation = parts.join(" ");
    }

    return {
      request: request,
      rows: rows,
      validRows: validRows,
      eligibleRows: eligibleRows,
      recommended: recommended,
      cheapestValid: cheapestValid,
      earliestValid: earliestValid,
      longestTerms: longestTerms,
      baseline: baseline,
      explanation: explanation
    };
  }

  /* ============================================================
     PURCHASE ORDERS
     ============================================================ */

  function receivedQuantity(order) {
    return (order.receipts || []).reduce(function (sum, r) {
      return sum + (Number(r.quantity) || 0);
    }, 0);
  }

  function outstandingQuantity(order) {
    return Math.max(0, (Number(order.quantityOrdered) || 0) - receivedQuantity(order));
  }

  /* The status shown to the user. Draft and Cancelled are manual
     states. Everything else is derived from the receipts, so the
     label can never disagree with the quantities.                 */
  function displayStatus(order) {
    if (order.status === "Draft") return "Draft";
    if (order.status === "Cancelled") return "Cancelled";

    const received = receivedQuantity(order);
    const ordered = Number(order.quantityOrdered) || 0;

    if (received <= 0) return "Ordered";
    if (received < ordered) return "Partially received";
    return "Received";
  }

  function isOpen(order) {
    const status = displayStatus(order);
    return status === "Ordered" || status === "Partially received";
  }

  /* Value of goods still to arrive = remaining quantity x the unit
     price on the purchase order. Stated in full wherever it appears. */
  function outstandingValue(order) {
    const price = Number(order.snapshot && order.snapshot.unitPrice) || 0;
    return round2(outstandingQuantity(order) * price);
  }

  /* All the reasons a purchase order needs a human to look at it. */
  function orderFlags(order) {
    const flags = [];
    const now = today();
    const status = displayStatus(order);

    if (status === "Cancelled" || status === "Received" || status === "Draft") {
      if (status === "Draft") {
        flags.push({
          code: "draft",
          severity: "info",
          label: "Draft",
          detail: "This order has not been placed with the supplier yet."
        });
      }
      return flags;
    }

    const outstanding = outstandingQuantity(order);

    if (!order.confirmedDeliveryDate) {
      flags.push({
        code: "no-confirmation",
        severity: "warning",
        label: "No supplier confirmation",
        detail: "The supplier has not confirmed a delivery date for this order."
      });
    } else if (outstanding > 0 && order.confirmedDeliveryDate < now) {
      const late = daysBetween(order.confirmedDeliveryDate, now);
      flags.push({
        code: "overdue",
        severity: "critical",
        label: "Overdue",
        detail:
          outstanding + " " + (order.snapshot.unit || "units") + " still outstanding, " +
          late + " days after the confirmed date of " + formatDate(order.confirmedDeliveryDate) + "."
      });
    }

    if (
      order.latestExpectedDate &&
      order.requiredDate &&
      order.latestExpectedDate > order.requiredDate
    ) {
      flags.push({
        code: "expected-after-required",
        severity: "warning",
        label: "Expected after required date",
        detail:
          "Latest expected " + formatDate(order.latestExpectedDate) + ", required " + formatDate(order.requiredDate) + "."
      });
    }

    if (order.nextFollowUpDate && order.nextFollowUpDate <= now) {
      flags.push({
        code: "follow-up",
        severity: order.nextFollowUpDate < now ? "warning" : "info",
        label: order.nextFollowUpDate < now ? "Follow-up overdue" : "Follow-up due today",
        detail: "Next follow-up was set for " + formatDate(order.nextFollowUpDate) + "."
      });
    }

    return flags;
  }

  /* Checks a proposed goods receipt before it is accepted. */
  function validateReceipt(order, quantity, date, ignoreReceiptId) {
    if (!isNumber(quantity) || quantity <= 0) {
      return { ok: false, message: "Received quantity must be a number greater than zero." };
    }
    if (!date) {
      return { ok: false, message: "Please enter the date the goods were received." };
    }

    const alreadyReceived = (order.receipts || []).reduce(function (sum, r) {
      return r.id === ignoreReceiptId ? sum : sum + (Number(r.quantity) || 0);
    }, 0);

    const ordered = Number(order.quantityOrdered) || 0;
    if (alreadyReceived + quantity > ordered) {
      const remaining = ordered - alreadyReceived;
      return {
        ok: false,
        message:
          "That is more than the outstanding quantity. Ordered " + ordered + ", already received " +
          alreadyReceived + ", so at most " + remaining + " can still be recorded."
      };
    }

    return { ok: true };
  }

  /* ============================================================
     OVERVIEW FIGURES
     Each one is counted straight from the stored records, so every
     number on the overview can be traced back to a list.
     ============================================================ */

  function overviewMetrics(data) {
    const openOrders = data.orders.filter(isOpen);

    const outstandingGoodsValue = round2(
      openOrders.reduce(function (sum, o) {
        return sum + outstandingValue(o);
      }, 0)
    );

    const overdueOrders = data.orders.filter(function (o) {
      return orderFlags(o).some(function (f) {
        return f.code === "overdue";
      });
    });

    const awaitingDecision = data.requests.filter(function (r) {
      return !r.decision;
    });

    return {
      openOrders: openOrders,
      openOrderCount: openOrders.length,
      outstandingGoodsValue: outstandingGoodsValue,
      overdueOrders: overdueOrders,
      overdueCount: overdueOrders.length,
      awaitingDecision: awaitingDecision,
      awaitingDecisionCount: awaitingDecision.length
    };
  }

  /* Everything that needs a person's attention, most urgent first. */
  function attentionItems(data) {
    const items = [];

    data.orders.forEach(function (order) {
      orderFlags(order).forEach(function (flag) {
        if (flag.code === "draft") return;      // drafts are listed separately
        items.push({
          kind: "order",
          id: order.id,
          severity: flag.severity,
          title: order.reference + " - " + (order.snapshot.supplierName || ""),
          label: flag.label,
          detail: flag.detail
        });
      });
    });

    data.requests.forEach(function (request) {
      if (request.decision) return;
      const comparison = compareRequest(request, data.quotations);

      if (comparison.rows.length === 0) {
        items.push({
          kind: "request",
          id: request.id,
          severity: "info",
          title: request.reference + " - " + request.product,
          label: "No quotations yet",
          detail: "Required by " + formatDate(request.requiredDate) + "."
        });
      } else if (comparison.eligibleRows.length === 0) {
        items.push({
          kind: "request",
          id: request.id,
          severity: "warning",
          title: request.reference + " - " + request.product,
          label: "No quotation meets the date",
          detail:
            comparison.rows.length + " quotations recorded, none can deliver by " +
            formatDate(request.requiredDate) + "."
        });
      } else {
        items.push({
          kind: "request",
          id: request.id,
          severity: "info",
          title: request.reference + " - " + request.product,
          label: "Decision needed",
          detail:
            comparison.eligibleRows.length + " comparable quotations ready, required by " +
            formatDate(request.requiredDate) + "."
        });
      }
    });

    const order = { critical: 0, warning: 1, info: 2 };
    items.sort(function (a, b) {
      return order[a.severity] - order[b.severity];
    });

    return items;
  }

  /* Monthly value of purchase orders actually placed. Definition is
     shown next to the chart so the figures can be checked by hand. */
  function monthlyOrderValue(data, monthCount) {
    const months = [];
    const now = new Date();

    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
        label: d.toLocaleDateString("en-GB", { month: "short" }),
        fullLabel: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        total: 0,
        count: 0
      });
    }

    data.orders.forEach(function (o) {
      const status = displayStatus(o);
      if (status === "Draft" || status === "Cancelled") return;
      if (!o.orderDate) return;

      const key = String(o.orderDate).slice(0, 7);
      const bucket = months.find(function (m) {
        return m.key === key;
      });
      if (bucket) {
        bucket.total = round2(bucket.total + (Number(o.snapshot.totalQuotedCost) || 0));
        bucket.count += 1;
      }
    });

    return months;
  }

  /* ---------- shared formatting ---------- */
  const eurFormatter = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function formatEur(value) {
    if (value === null || value === undefined || !isFinite(value)) return "-";
    return eurFormatter.format(value);
  }

  /* "2026-09-15" -> "15 Sept 2026", so explanations read the same way
     as the rest of the screen. */
  function formatDate(iso) {
    if (!iso) return "not set";
    const parts = String(iso).split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return {
    MANUAL_STATUSES: MANUAL_STATUSES,
    round2: round2,
    today: today,
    daysBetween: daysBetween,
    isNumber: isNumber,
    formatEur: formatEur,
    formatDate: formatDate,
    evaluateQuotation: evaluateQuotation,
    compareRequest: compareRequest,
    receivedQuantity: receivedQuantity,
    outstandingQuantity: outstandingQuantity,
    outstandingValue: outstandingValue,
    displayStatus: displayStatus,
    isOpen: isOpen,
    orderFlags: orderFlags,
    validateReceipt: validateReceipt,
    overviewMetrics: overviewMetrics,
    attentionItems: attentionItems,
    monthlyOrderValue: monthlyOrderValue
  };
})();
