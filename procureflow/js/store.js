/* ============================================================
   ProcureFlow - storage
   ------------------------------------------------------------
   Everything the app knows lives in ONE object saved under one
   localStorage key, together with a version number. The version is
   what lets an older saved file be upgraded instead of wiped.

   Important honesty note: this is browser storage on one device.
   It is not a database, not shared between devices or browsers,
   and it disappears if the browser's site data is cleared.
   ============================================================ */

window.PF = window.PF || {};

PF.store = (function () {
  "use strict";

  const KEY = "procureflow.data";
  const CURRENT_VERSION = 2;

  // Keys written by version 1 of this project.
  const LEGACY_KEYS = { suppliers: "procureflow.suppliers", orders: "procureflow.orders" };

  let data = null;              // the single in-memory copy
  let storageWorks = true;      // false when the browser blocks localStorage
  const startupMessages = [];   // things the user should be told on first paint

  function note(kind, text) {
    startupMessages.push({ kind: kind, text: text });
  }

  function getStartupMessages() {
    return startupMessages.slice();
  }

  /* ---------- raw read / write ---------- */

  function readRaw(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      storageWorks = false;
      return null;
    }
  }

  function writeRaw(key, text) {
    try {
      window.localStorage.setItem(key, text);
      return true;
    } catch (error) {
      storageWorks = false;
      return false;
    }
  }

  function save() {
    if (!data) return false;
    const ok = writeRaw(KEY, JSON.stringify(data));
    if (!ok) {
      note(
        "warning",
        "Your browser is not allowing this page to save data. You can still use the app, " +
          "but anything you change will be lost when you close the tab."
      );
    }
    return ok;
  }

  /* ---------- activity history ----------
     This is a plain local list of what happened in this browser. It is
     NOT a secure audit trail: anyone using this browser can edit or
     clear it, and it proves nothing to a third party.                */
  function logActivity(text) {
    if (!data) return;
    if (!Array.isArray(data.activity)) data.activity = [];
    data.activity.unshift({ at: PF.seed.isoOf(new Date()), text: String(text) });
    if (data.activity.length > 200) data.activity.length = 200;
  }

  /* ---------- validation ----------
     A saved file is only accepted if it has the shape we expect. This
     stops a corrupted or hand-edited file from half-loading and
     producing nonsense figures.                                       */
  function looksLikeDataset(value) {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Array.isArray(value.suppliers) &&
      Array.isArray(value.requests) &&
      Array.isArray(value.quotations) &&
      Array.isArray(value.orders)
    );
  }

  /* Fills in anything a slightly older or hand-edited record is missing,
     so the rest of the app can rely on the fields existing.            */
  function normalise(dataset) {
    dataset.version = CURRENT_VERSION;
    dataset.meta = dataset.meta || { seededOn: PF.seed.isoOf(new Date()) };
    dataset.activity = Array.isArray(dataset.activity) ? dataset.activity : [];

    dataset.suppliers.forEach(function (s) {
      if (typeof s.archived !== "boolean") s.archived = false;
      if (typeof s.notes !== "string") s.notes = "";
      if (s.indicativePrice === undefined) s.indicativePrice = s.referencePrice;
    });

    dataset.requests.forEach(function (r) {
      if (r.decision === undefined) r.decision = null;
      if (typeof r.notes !== "string") r.notes = "";
    });

    dataset.orders.forEach(function (o) {
      if (!Array.isArray(o.receipts)) o.receipts = [];
      if (!Array.isArray(o.followUps)) o.followUps = [];
      if (o.nextFollowUpDate === undefined) o.nextFollowUpDate = null;
      if (typeof o.notes !== "string") o.notes = "";
      if (!o.snapshot) o.snapshot = {};
      if (o.quantityOrdered === undefined) o.quantityOrdered = o.snapshot.quantity || 0;
    });

    return dataset;
  }

  /* ---------- migration from version 1 ----------
     Version 1 stored two separate arrays and used the statuses
     Draft / Ordered / Shipped / Delivered. Nothing is thrown away:

       Draft      -> Draft      (still a draft)
       Ordered    -> Ordered
       Shipped    -> Ordered    (dispatched but not yet received)
       Delivered  -> Ordered + a receipt for the full quantity, dated
                     with the delivery date that was already recorded,
                     which makes the order calculate as "Received".    */
  function migrateFromV1(oldSuppliers, oldOrders) {
    const seeded = PF.seed.build();
    const suppliers = [];
    const byOldId = {};

    (oldSuppliers || []).forEach(function (s) {
      const migrated = {
        id: s.id,
        name: s.name,
        country: s.country,
        category: s.category,
        indicativePrice: s.referencePrice,
        leadTimeDays: s.leadTimeDays,
        paymentTerms: s.paymentTerms,
        archived: false,
        notes: ""
      };
      suppliers.push(migrated);
      byOldId[s.id] = migrated;
    });

    // Add any seeded supplier the saved file does not already have.
    seeded.suppliers.forEach(function (s) {
      const exists = suppliers.some(function (existing) {
        return existing.name.toLowerCase() === s.name.toLowerCase();
      });
      if (!exists) suppliers.push(Object.assign({}, s));
    });

    const orders = (oldOrders || []).map(function (o, index) {
      const supplier = byOldId[o.supplierId];
      const total =
        typeof o.total === "number" ? o.total : (Number(o.quantity) || 0) * (Number(o.unitPrice) || 0);
      const receipts = [];

      if (o.status === "Delivered") {
        receipts.push({
          id: "rec-mig-" + index,
          date: o.actualDelivery || o.expectedDelivery,
          quantity: Number(o.quantity) || 0,
          notes: "Recorded during the upgrade from the earlier version.",
          recordedAt: o.actualDelivery || o.expectedDelivery
        });
      }

      return {
        id: o.id || "po-mig-" + index,
        reference: o.poNumber,
        requestId: null,
        quotationId: null,
        supplierId: o.supplierId,
        snapshot: {
          supplierName: supplier ? supplier.name : "Unknown supplier",
          product: o.product,
          specification: "Created in the earlier version, before specifications were recorded.",
          unit: "pcs",
          quantity: Number(o.quantity) || 0,
          unitPrice: Number(o.unitPrice) || 0,
          freight: 0,
          otherCharges: 0,
          discount: 0,
          totalQuotedCost: total,
          effectiveUnitCost: o.quantity ? total / o.quantity : 0,
          paymentTermsDays: null,
          rationale: "No comparison was recorded for this order.",
          decidedAt: null
        },
        orderDate: o.orderDate,
        requiredDate: o.expectedDelivery,
        confirmedDeliveryDate: o.expectedDelivery,
        latestExpectedDate: o.expectedDelivery,
        quantityOrdered: Number(o.quantity) || 0,
        status: o.status === "Draft" ? "Draft" : "Ordered",
        receipts: receipts,
        followUps: [],
        nextFollowUpDate: null,
        notes: "",
        createdAt: o.createdAt || o.orderDate
      };
    });

    // Keep the two demo purchase orders that belong to the seeded
    // sourcing cases, so the new features have something to show.
    seeded.orders
      .filter(function (o) {
        return o.requestId !== null;
      })
      .forEach(function (o) {
        const clash = orders.some(function (existing) {
          return existing.reference === o.reference;
        });
        if (!clash) orders.push(o);
      });

    const dataset = {
      version: CURRENT_VERSION,
      meta: {
        seededOn: seeded.meta.seededOn,
        createdAt: seeded.meta.seededOn,
        note: "Upgraded from the earlier version of this project."
      },
      suppliers: suppliers,
      requests: seeded.requests,
      quotations: seeded.quotations,
      orders: orders,
      activity: [
        {
          at: PF.seed.isoOf(new Date()),
          text:
            "Saved data upgraded to version 2. Existing suppliers and purchase orders were kept; " +
            "the sourcing demonstration records were added."
        }
      ]
    };

    note(
      "info",
      "Your earlier ProcureFlow data was upgraded and kept. Purchase orders that were marked " +
        "Delivered now show a goods receipt for the full quantity."
    );

    return normalise(dataset);
  }

  /* ---------- load ---------- */

  function load() {
    const raw = readRaw(KEY);

    if (!storageWorks) {
      note(
        "warning",
        "This browser is blocking local storage (this often happens in private windows). " +
          "The demo data is shown, but nothing you change will be saved."
      );
      data = normalise(PF.seed.build());
      return data;
    }

    if (raw) {
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        parsed = null;
      }

      if (looksLikeDataset(parsed)) {
        data = normalise(parsed);
        return data;
      }

      /* The saved data is unreadable. It is NOT deleted - it is moved
         aside under a dated key so nothing is silently destroyed. */
      const rescueKey = KEY + ".unreadable." + Date.now();
      writeRaw(rescueKey, raw);
      note(
        "warning",
        "The saved ProcureFlow data could not be read, so the demo data was loaded instead. " +
          "The unreadable copy was kept in your browser under \"" + rescueKey + "\" and nothing was deleted."
      );
      data = normalise(PF.seed.build());
      save();
      return data;
    }

    // No version 2 data. Is there version 1 data to upgrade?
    const legacySuppliers = readRaw(LEGACY_KEYS.suppliers);
    const legacyOrders = readRaw(LEGACY_KEYS.orders);

    if (legacySuppliers && legacyOrders) {
      let s = null;
      let o = null;
      try {
        s = JSON.parse(legacySuppliers);
        o = JSON.parse(legacyOrders);
      } catch (error) {
        s = null;
        o = null;
      }

      if (Array.isArray(s) && Array.isArray(o)) {
        data = migrateFromV1(s, o);
        save();
        return data;
      }
    }

    // Nothing saved at all - first visit.
    data = normalise(PF.seed.build());
    save();
    return data;
  }

  /* ---------- reset / backup / restore ---------- */

  function resetDemo() {
    data = normalise(PF.seed.build());
    logActivity("Demo data reset. All previously stored records were replaced.");
    save();
    return data;
  }

  function exportJson() {
    return JSON.stringify(data, null, 2);
  }

  /* Checks a restore file before it is allowed to replace anything. */
  function validateImport(text) {
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false, message: "That file is not valid JSON, so it cannot be a ProcureFlow backup." };
    }

    if (!looksLikeDataset(parsed)) {
      return {
        ok: false,
        message:
          "That file does not look like a ProcureFlow backup. A backup contains suppliers, " +
          "requests, quotations and orders."
      };
    }

    if (Number(parsed.version) > CURRENT_VERSION) {
      return {
        ok: false,
        message:
          "That backup was made by a newer version of ProcureFlow (version " +
          parsed.version + "). This copy can only read up to version " + CURRENT_VERSION + "."
      };
    }

    return {
      ok: true,
      dataset: parsed,
      summary: {
        suppliers: parsed.suppliers.length,
        requests: parsed.requests.length,
        quotations: parsed.quotations.length,
        orders: parsed.orders.length,
        version: parsed.version || 1
      }
    };
  }

  function applyImport(dataset) {
    data = normalise(dataset);
    logActivity("Data restored from a backup file, replacing everything that was stored before.");
    save();
    return data;
  }

  function get() {
    return data;
  }

  function isStorageWorking() {
    return storageWorks;
  }

  return {
    CURRENT_VERSION: CURRENT_VERSION,
    load: load,
    save: save,
    get: get,
    resetDemo: resetDemo,
    exportJson: exportJson,
    validateImport: validateImport,
    applyImport: applyImport,
    logActivity: logActivity,
    getStartupMessages: getStartupMessages,
    isStorageWorking: isStorageWorking
  };
})();
