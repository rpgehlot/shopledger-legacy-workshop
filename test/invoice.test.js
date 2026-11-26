'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');
var invoice = require('../lib/invoice');
var orders = require('../lib/orders');
var pricing = require('../lib/pricing');

function makeStoredOrder(items, coupon) {
  var totals = pricing.computeTotals(items, coupon);
  var db = { orders: [], nextOrderId: 1001 };
  var order = orders.add(db, {
    items: items,
    coupon: coupon,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  });

  return { order: order, totals: totals };
}

test('invoice uses the HSN GST slab stored on an order line', function () {
  var result = makeStoredOrder([
    { id: 1, name: 'Rice', sku: 'RICE-01', hsn: '1006', price: 100, qty: 2 }
  ], '');
  var figures = invoice.computeInvoiceFigures(result.order);
  var html = invoice.render(result.order);

  assert.equal(result.totals.tax, 10);
  assert.equal(result.totals.cgst, 5);
  assert.equal(result.totals.sgst, 5);
  assert.equal(result.totals.total, 210);
  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.rows[0].lineTax, 10);
  assert.equal(figures.tax, result.totals.tax);
  assert.equal(figures.cgst, result.totals.cgst);
  assert.equal(figures.sgst, result.totals.sgst);
  assert.equal(figures.total, result.totals.total);
  assert.match(html, /<td class="r">5%<\/td>/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹210\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice applies the coupon cap to the pre-tax subtotal', function () {
  var result = makeStoredOrder([
    { id: 2, name: 'Rice bulk pack', sku: 'RICE-02', hsn: '1006', price: 5000, qty: 1 }
  ], 'SAVE10');
  var figures = invoice.computeInvoiceFigures(result.order);
  var html = invoice.render(result.order);

  assert.equal(result.totals.discount, 150);
  assert.equal(result.totals.tax, 242.5);
  assert.equal(result.totals.cgst, 121.25);
  assert.equal(result.totals.sgst, 121.25);
  assert.equal(result.totals.total, 5092.5);
  assert.equal(figures.discount, result.totals.discount);
  assert.equal(figures.tax, result.totals.tax);
  assert.equal(figures.cgst, result.totals.cgst);
  assert.equal(figures.sgst, result.totals.sgst);
  assert.equal(figures.total, result.totals.total);
  assert.equal(figures.discount, 150);
  assert.equal(figures.rows[0].taxable, 4850);
  assert.match(html, /Coupon Discount \(SAVE10\)<\/td><td class="r" style="color:#16a34a">-₹150\.00/);
  assert.match(html, /Taxable Value<\/th>/);
  assert.match(html, /₹4850\.00/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹5092\.50/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice preserves the recorded discount after a coupon expires', function () {
  var order = {
    id: 1009,
    items: [
      { id: 3, name: 'Rice', sku: 'RICE-03', hsn: '1006', price: 1000, qty: 1 }
    ],
    coupon: 'DIWALI20',
    subtotal: 1000,
    discount: 200,
    tax: 40,
    total: 840
  };
  var figures = invoice.computeInvoiceFigures(order);
  var html = invoice.render(order);

  assert.equal(figures.discount, 200);
  assert.equal(figures.tax, 40);
  assert.equal(figures.total, 840);
  assert.equal(figures.rows[0].lineTax, 40);
  assert.match(html, /Coupon Discount \(DIWALI20\)<\/td><td class="r" style="color:#16a34a">-₹200\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});
