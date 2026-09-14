/* ============================================================
   ProcureFlow - demo data (seed)
   ------------------------------------------------------------
   This file BUILDS the example dataset. It does not draw anything.

   Every organisation, quotation and transaction below is invented
   for a portfolio demonstration. Nothing here is real.

   Dates are generated relative to the day the demo is first
   created ("day 0"), then stored as fixed calendar dates. They do
   not drift on refresh - only a confirmed demo reset rebuilds them.
   ============================================================ */

window.PF = window.PF || {};

PF.seed = (function () {
  "use strict";

  /* ---------- date helpers ----------
     All dates in this app are plain "YYYY-MM-DD" text. Because the
     year comes first, comparing two of them with < or > gives the
     correct chronological answer, and no time-of-day or timezone can
     creep in. Every comparison in ProcureFlow is date-only.        */
  function isoOf(date) {
    return (
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0")
    );
  }

  function makeDayFn(baseIso) {
    return function day(offset) {
      const d = new Date(baseIso + "T12:00:00");
      d.setDate(d.getDate() + offset);
      return isoOf(d);
    };
  }

  /* ---------- suppliers ----------
     The original seven-supplier network is kept unchanged. Two
     packaging suppliers are added so the boxes scenario can compare
     three genuinely like-for-like quotations.                      */
  function buildSuppliers() {
    return [
      { id: "s1", name: "Nordkaira Components Oy",  country: "Finland",     category: "Electronics & Components", indicativePrice: 24.5,  leadTimeDays: 7,  paymentTerms: "Net 30", archived: false, notes: "" },
      { id: "s2", name: "Vaasan Teraspaja Oy",      country: "Finland",     category: "Metals & Raw Materials",   indicativePrice: 18.9,  leadTimeDays: 12, paymentTerms: "Net 14", archived: false, notes: "" },
      { id: "s3", name: "Lahtinen Pakkaus Oy",      country: "Finland",     category: "Packaging Materials",      indicativePrice: 3.4,   leadTimeDays: 5,  paymentTerms: "Net 30", archived: false, notes: "Local supplier, short transport distance." },
      { id: "s4", name: "Rheinwerk Industrie GmbH", country: "Germany",     category: "Electronics & Components", indicativePrice: 21.8,  leadTimeDays: 15, paymentTerms: "Net 45", archived: false, notes: "" },
      { id: "s5", name: "Delta Logistiek B.V.",     country: "Netherlands", category: "Logistics & Transport",    indicativePrice: 46.0,  leadTimeDays: 9,  paymentTerms: "Net 30", archived: false, notes: "" },
      { id: "s6", name: "Ardenne Chimie SA",        country: "Belgium",     category: "Chemicals & Coatings",     indicativePrice: 12.75, leadTimeDays: 20, paymentTerms: "Net 60", archived: false, notes: "" },
      { id: "s7", name: "Norrsken Verktyg AB",      country: "Sweden",      category: "Tools & Maintenance",      indicativePrice: 31.2,  leadTimeDays: 8,  paymentTerms: "Net 30", archived: false, notes: "" },
      { id: "s8", name: "Vermeer Verpakking B.V.",  country: "Netherlands", category: "Packaging Materials",      indicativePrice: 1.1,   leadTimeDays: 8,  paymentTerms: "Net 30", archived: false, notes: "Added for the packaging sourcing case." },
      { id: "s9", name: "Baltic Kraft Pakend OU",   country: "Estonia",     category: "Packaging Materials",      indicativePrice: 0.95,  leadTimeDays: 15, paymentTerms: "Net 30", archived: false, notes: "Lowest unit price, longest lead time." }
    ];
  }

  /* ---------- the main sourcing scenario ----------
     1,000 identical corrugated boxes, same specification, needed in
     ten calendar days. Three comparable quotations:

       A  Lahtinen Pakkaus    1000 x 1.00 + 250 freight = 1250, 6 days
       B  Vermeer Verpakking  1000 x 1.10 +  80 freight = 1180, 8 days
       C  Baltic Kraft        1000 x 0.95 + 100 freight = 1050, 15 days

     C is cheapest overall but misses the ten-day deadline, so B is
     the lowest-cost option that can actually be delivered in time. */
  function buildRequests(day) {
    return [
      {
        id: "req-1",
        reference: "REQ-2026-0001",
        product: "Corrugated shipping boxes 400 x 300 x 200 mm",
        specification:
          "Single wall, B-flute, brown kraft, 1.2 kg/cm2 burst strength, plain unprinted, flat packed.",
        quantity: 1000,
        unit: "pcs",
        requiredDate: day(10),
        deliveryLocation: "Vantaa distribution centre, Finland",
        budget: 1300,
        notes:
          "Replacement stock for the autumn campaign. Identical specification from all suppliers - compare like for like.",
        createdAt: day(-2),
        decision: null
      },
      {
        id: "req-2",
        reference: "REQ-2026-0002",
        product: "Cut-resistant safety gloves, level C, size 9",
        specification:
          "EN 388 cut level C, nitrile coated palm, size 9, supplied in pairs.",
        quantity: 800,
        unit: "pairs",
        requiredDate: day(14),
        deliveryLocation: "Tampere production site, Finland",
        budget: 6000,
        notes:
          "Kept in the demo to show how incomplete, expired, non-compliant and minimum-order quotations are handled.",
        createdAt: day(-4),
        decision: null
      },
      {
        id: "req-3",
        reference: "REQ-2026-0003",
        product: "Stretch film 500 mm, 23 micron",
        specification: "Hand-applied pallet wrap, 500 mm width, 23 micron, 300 m per roll.",
        quantity: 1200,
        unit: "rolls",
        requiredDate: day(6),
        deliveryLocation: "Vantaa distribution centre, Finland",
        budget: 4500,
        notes: "Routine replenishment.",
        createdAt: day(-12),
        decision: {
          quotationId: "quo-r3-a",
          decidedAt: day(-7),
          rationale:
            "Lowest total quoted cost among the compliant quotations that met the required date.",
          overrodeRecommendation: false,
          acceptedLateDelivery: false
        }
      },
      {
        id: "req-4",
        reference: "REQ-2026-0004",
        product: "PLC I/O module, 16 channels",
        specification: "24 V DC digital I/O module, 16 channels, DIN rail mounting.",
        quantity: 400,
        unit: "pcs",
        requiredDate: day(-12),
        deliveryLocation: "Tampere production site, Finland",
        budget: 9500,
        notes: "Line upgrade project.",
        createdAt: day(-38),
        decision: {
          quotationId: "quo-r4-a",
          decidedAt: day(-32),
          rationale:
            "Only compliant quotation that confirmed delivery before the required date. Accepted despite a higher unit price.",
          overrodeRecommendation: false,
          acceptedLateDelivery: false
        }
      }
    ];
  }

  function buildQuotations(day) {
    return [
      /* ----- REQ-2026-0001: the like-for-like comparison ----- */
      {
        id: "quo-r1-a", requestId: "req-1", supplierId: "s3",
        quotedSpec: "Single wall B-flute brown kraft, 400 x 300 x 200 mm, plain.",
        compliant: true,
        quantity: 1000, unit: "pcs",
        unitPrice: 1.0, freight: 250, otherCharges: 0, discount: 0,
        earliestDelivery: day(6), validUntil: day(21),
        minOrderQuantity: 500, paymentTermsDays: 14,
        notes: "Stock item. Delivery from Lahti warehouse.",
        createdAt: day(-1)
      },
      {
        id: "quo-r1-b", requestId: "req-1", supplierId: "s8",
        quotedSpec: "Single wall B-flute brown kraft, 400 x 300 x 200 mm, plain.",
        compliant: true,
        quantity: 1000, unit: "pcs",
        unitPrice: 1.1, freight: 80, otherCharges: 0, discount: 0,
        earliestDelivery: day(8), validUntil: day(30),
        minOrderQuantity: 250, paymentTermsDays: 30,
        notes: "Consolidated road freight, lower transport charge.",
        createdAt: day(-1)
      },
      {
        id: "quo-r1-c", requestId: "req-1", supplierId: "s9",
        quotedSpec: "Single wall B-flute brown kraft, 400 x 300 x 200 mm, plain.",
        compliant: true,
        quantity: 1000, unit: "pcs",
        unitPrice: 0.95, freight: 100, otherCharges: 0, discount: 0,
        earliestDelivery: day(15), validUntil: day(30),
        minOrderQuantity: 1000, paymentTermsDays: 30,
        notes: "Lowest unit price. Production slot only available in two weeks.",
        createdAt: day(-1)
      },

      /* ----- REQ-2026-0002: deliberately problematic quotations ----- */
      {
        id: "quo-r2-a", requestId: "req-2", supplierId: "s7",
        quotedSpec: "EN 388 cut level C nitrile coated, size 9.",
        compliant: true,
        quantity: 800, unit: "pairs",
        unitPrice: 6.9, freight: 45, otherCharges: 0, discount: 0,
        earliestDelivery: day(9), validUntil: day(-3),
        minOrderQuantity: 100, paymentTermsDays: 30,
        notes: "Quotation validity has passed - must be re-requested.",
        createdAt: day(-30)
      },
      {
        id: "quo-r2-b", requestId: "req-2", supplierId: "s1",
        quotedSpec: "EN 388 cut level B nitrile coated, size 9.",
        compliant: false,
        quantity: 800, unit: "pairs",
        unitPrice: 4.2, freight: 40, otherCharges: 0, discount: 0,
        earliestDelivery: day(5), validUntil: day(25),
        minOrderQuantity: 100, paymentTermsDays: 30,
        notes: "Cheaper, but cut level B does not meet the level C requirement.",
        createdAt: day(-3)
      },
      {
        id: "quo-r2-c", requestId: "req-2", supplierId: "s4",
        quotedSpec: "EN 388 cut level C nitrile coated, size 9.",
        compliant: true,
        quantity: 800, unit: "pairs",
        unitPrice: 5.8, freight: 120, otherCharges: 0, discount: 0,
        earliestDelivery: day(11), validUntil: day(28),
        minOrderQuantity: 1000, paymentTermsDays: 45,
        notes: "Minimum order 1000 pairs - more than we need.",
        createdAt: day(-3)
      },
      {
        id: "quo-r2-d", requestId: "req-2", supplierId: "s6",
        quotedSpec: "EN 388 cut level C nitrile coated, size 9.",
        compliant: true,
        quantity: 800, unit: "pairs",
        unitPrice: 6.1, freight: null, otherCharges: 0, discount: 0,
        earliestDelivery: day(10), validUntil: day(26),
        minOrderQuantity: 200, paymentTermsDays: 60,
        notes: "Freight not yet quoted - the total cannot be calculated.",
        createdAt: day(-2)
      },

      /* ----- REQ-2026-0003: already decided, became a partially received PO ----- */
      {
        id: "quo-r3-a", requestId: "req-3", supplierId: "s3",
        quotedSpec: "Stretch film 500 mm, 23 micron, 300 m rolls.",
        compliant: true,
        quantity: 1200, unit: "rolls",
        unitPrice: 3.2, freight: 180, otherCharges: 0, discount: 0,
        earliestDelivery: day(4), validUntil: day(20),
        minOrderQuantity: 500, paymentTermsDays: 30,
        notes: "",
        createdAt: day(-10)
      },
      {
        id: "quo-r3-b", requestId: "req-3", supplierId: "s8",
        quotedSpec: "Stretch film 500 mm, 23 micron, 300 m rolls.",
        compliant: true,
        quantity: 1200, unit: "rolls",
        unitPrice: 3.35, freight: 90, otherCharges: 0, discount: 0,
        earliestDelivery: day(5), validUntil: day(20),
        minOrderQuantity: 500, paymentTermsDays: 30,
        notes: "",
        createdAt: day(-10)
      },

      /* ----- REQ-2026-0004: already decided, became the overdue PO ----- */
      {
        id: "quo-r4-a", requestId: "req-4", supplierId: "s4",
        quotedSpec: "24 V DC digital I/O module, 16 channels, DIN rail.",
        compliant: true,
        quantity: 400, unit: "pcs",
        unitPrice: 21.8, freight: 260, otherCharges: 0, discount: 0,
        earliestDelivery: day(-18), validUntil: day(-10),
        minOrderQuantity: 50, paymentTermsDays: 45,
        notes: "",
        createdAt: day(-36)
      },
      {
        id: "quo-r4-b", requestId: "req-4", supplierId: "s1",
        quotedSpec: "24 V DC digital I/O module, 16 channels, DIN rail.",
        compliant: true,
        quantity: 400, unit: "pcs",
        unitPrice: 20.4, freight: 190, otherCharges: 0, discount: 0,
        earliestDelivery: day(-6), validUntil: day(-10),
        minOrderQuantity: 100, paymentTermsDays: 30,
        notes: "Cheaper but could not deliver before the required date.",
        createdAt: day(-36)
      }
    ];
  }

  /* ---------- purchase orders ----------
     `status` here only ever holds a manual state (Draft / Ordered /
     Cancelled). "Partially received" and "Received" are never stored -
     they are calculated from the receipts, so the label can never
     disagree with the quantities.                                    */
  function buildOrders(day) {
    const orders = [
      {
        id: "po-2", reference: "PO-2026-0002",
        requestId: "req-3", quotationId: "quo-r3-a", supplierId: "s3",
        snapshot: {
          supplierName: "Lahtinen Pakkaus Oy",
          product: "Stretch film 500 mm, 23 micron",
          specification: "Hand-applied pallet wrap, 500 mm width, 23 micron, 300 m per roll.",
          unit: "rolls", quantity: 1200,
          unitPrice: 3.2, freight: 180, otherCharges: 0, discount: 0,
          totalQuotedCost: 4020, effectiveUnitCost: 3.35,
          paymentTermsDays: 30,
          rationale: "Lowest total quoted cost among the compliant quotations that met the required date.",
          decidedAt: day(-7)
        },
        orderDate: day(-6),
        requiredDate: day(6),
        confirmedDeliveryDate: day(4),
        latestExpectedDate: day(4),
        quantityOrdered: 1200,
        status: "Ordered",
        receipts: [
          { id: "rec-1", date: day(-1), quantity: 500, notes: "First part delivery, 500 rolls on two pallets.", recordedAt: day(-1) }
        ],
        followUps: [],
        nextFollowUpDate: day(2),
        notes: "Supplier confirmed the remaining 700 rolls for the confirmed date.",
        createdAt: day(-6)
      },
      {
        id: "po-3", reference: "PO-2026-0003",
        requestId: "req-4", quotationId: "quo-r4-a", supplierId: "s4",
        snapshot: {
          supplierName: "Rheinwerk Industrie GmbH",
          product: "PLC I/O module, 16 channels",
          specification: "24 V DC digital I/O module, 16 channels, DIN rail mounting.",
          unit: "pcs", quantity: 400,
          unitPrice: 21.8, freight: 260, otherCharges: 0, discount: 0,
          totalQuotedCost: 8980, effectiveUnitCost: 22.45,
          paymentTermsDays: 45,
          rationale: "Only compliant quotation that confirmed delivery before the required date.",
          decidedAt: day(-32)
        },
        orderDate: day(-31),
        requiredDate: day(-12),
        confirmedDeliveryDate: day(-18),
        latestExpectedDate: day(4),
        quantityOrdered: 400,
        status: "Ordered",
        receipts: [
          { id: "rec-2", date: day(-16), quantity: 150, notes: "Partial shipment, 150 modules.", recordedAt: day(-16) }
        ],
        followUps: [
          { id: "fu-1", date: day(-14), note: "Chased the outstanding 250 modules. Supplier reported a component shortage." },
          { id: "fu-2", date: day(-5),  note: "Supplier gave a new expected date. Original confirmed date is kept for the lateness record." }
        ],
        nextFollowUpDate: day(-1),
        notes: "Outstanding balance is late against the original confirmed date.",
        createdAt: day(-31)
      }
    ];

    /* A short history of completed purchases, recorded directly without a
       sourcing exercise (spot buys). They give the overview chart real
       figures to reconcile against.                                      */
    const history = [
      { ref: "PO-2026-0004", sup: "s1", name: "Nordkaira Components Oy", product: "Ribbon cable assembly, 1 m",     unit: "pcs", qty: 900,  price: 24.5,  freight: 120, ordered: -30,  lead: 7 },
      { ref: "PO-2026-0005", sup: "s3", name: "Lahtinen Pakkaus Oy",     product: "Thermal pallet labels 100x150",  unit: "pcs", qty: 12000, price: 0.09, freight: 60,  ordered: -34,  lead: 5 },
      { ref: "PO-2026-0006", sup: "s5", name: "Delta Logistiek B.V.",    product: "Road freight Hamburg-Tampere",   unit: "loads", qty: 10, price: 380,  freight: 0,   ordered: -47,  lead: 9 },
      { ref: "PO-2026-0007", sup: "s7", name: "Norrsken Verktyg AB",     product: "Cordless impact drill, 18 V",    unit: "pcs", qty: 25,   price: 149,  freight: 90,  ordered: -52,  lead: 8 },
      { ref: "PO-2026-0008", sup: "s2", name: "Vaasan Teraspaja Oy",     product: "Aluminium profile 6060-T6",      unit: "m",   qty: 420,  price: 27.4, freight: 210, ordered: -78,  lead: 12 },
      { ref: "PO-2026-0009", sup: "s6", name: "Ardenne Chimie SA",       product: "Degreasing solvent (25 L)",      unit: "drums", qty: 90, price: 12.75, freight: 140, ordered: -84, lead: 20 },
      { ref: "PO-2026-0010", sup: "s2", name: "Vaasan Teraspaja Oy",     product: "Stainless steel plate 3 mm",     unit: "sheets", qty: 300, price: 42,  freight: 320, ordered: -112, lead: 12 },
      { ref: "PO-2026-0011", sup: "s4", name: "Rheinwerk Industrie GmbH", product: "Industrial Ethernet switch, 8 port", unit: "pcs", qty: 60, price: 189, freight: 150, ordered: -140, lead: 15 }
    ];

    history.forEach(function (h, i) {
      const total = round2(h.qty * h.price + h.freight);
      orders.push({
        id: "po-h" + (i + 1),
        reference: h.ref,
        requestId: null,
        quotationId: null,
        supplierId: h.sup,
        snapshot: {
          supplierName: h.name,
          product: h.product,
          specification: "Recorded directly without a formal sourcing comparison.",
          unit: h.unit,
          quantity: h.qty,
          unitPrice: h.price,
          freight: h.freight,
          otherCharges: 0,
          discount: 0,
          totalQuotedCost: total,
          effectiveUnitCost: round2(total / h.qty),
          paymentTermsDays: 30,
          rationale: "Direct purchase, no comparison recorded.",
          decidedAt: null
        },
        orderDate: day(h.ordered),
        requiredDate: day(h.ordered + h.lead),
        confirmedDeliveryDate: day(h.ordered + h.lead),
        latestExpectedDate: day(h.ordered + h.lead),
        quantityOrdered: h.qty,
        status: "Ordered",
        receipts: [
          { id: "rec-h" + (i + 1), date: day(h.ordered + h.lead), quantity: h.qty, notes: "Full quantity received.", recordedAt: day(h.ordered + h.lead) }
        ],
        followUps: [],
        nextFollowUpDate: null,
        notes: "",
        createdAt: day(h.ordered)
      });
    });

    return orders;
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  /* ---------- assemble the whole dataset ---------- */
  function build(baseIso) {
    const seededOn = baseIso || isoOf(new Date());
    const day = makeDayFn(seededOn);

    return {
      version: 2,
      meta: {
        seededOn: seededOn,
        createdAt: seededOn,
        note: "Fictional demonstration data. Regenerated only by a confirmed demo reset."
      },
      suppliers: buildSuppliers(),
      requests: buildRequests(day),
      quotations: buildQuotations(day),
      orders: buildOrders(day),
      activity: [
        { at: seededOn, text: "Demo data created." }
      ]
    };
  }

  return {
    build: build,
    buildSuppliers: buildSuppliers,
    isoOf: isoOf
  };
})();
