figma.showUI(__html__, { width: 460, height: 360 });

var tests = [
  ['1. eval bieu thuc don gian', function () { return eval('1 + 1'); }],
  ['2. eval cham figma.*', function () { return eval('figma.currentPage.name'); }],
  ['3. new Function', function () { return new Function('return 2 + 3')(); }],
  ['4. eval async IIFE + globalThis', function () {
    globalThis.__probe = 7;
    return eval('(async function(){ return globalThis.__probe + 1; })()');
  }]
];

(async function () {
  var results = [];
  for (var i = 0; i < tests.length; i++) {
    var name = tests[i][0];
    try {
      var value = await tests[i][1]();
      results.push({ name: name, ok: true, value: String(value) });
    } catch (e) {
      results.push({ name: name, ok: false, value: String((e && e.message) || e) });
    }
  }
  figma.ui.postMessage(results);
})();
