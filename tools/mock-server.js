const fs = require('fs'), http = require('http');
eval(fs.readFileSync(__dirname + '/gas-mocks.js', 'utf8').replace(/global\./g, 'globalThis.').replace('const sheets={};', 'globalThis.sheets={};').replace('const P={};', 'globalThis.P={};').replace(/^class (\w+)/gm, 'globalThis.$1 = class $1'));
globalThis.ScriptApp = { WeekDay: { SUNDAY: 0 } };
globalThis.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) };
eval(fs.readFileSync('' + __dirname + '/../apps-script/Code.gs', 'utf8') + '\nglobalThis.__T = { setup, doPost, rowsOf_, PLANS, TX, DEBTS, P };');
__T.setup(); __T.P.API_TOKEN = 'TT';
http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/dump') { res.end(JSON.stringify({ plans: __T.rowsOf_(__T.PLANS), tx: __T.rowsOf_(__T.TX).length, debts: __T.rowsOf_(__T.DEBTS).map(d => [d.id, d.acct, d.dueDay]) })); return; }
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', '*'); res.end(); return; }
  res.setHeader('content-type', 'application/json'); res.end(String(__T.doPost({ postData: { contents: b } }))); }); }).listen(8790, () => console.log('up'));
