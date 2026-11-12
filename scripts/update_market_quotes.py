"""Fetch licensed/authorized Twelve Data /quote responses. No screen scraping.

Usage: TWELVEDATA_API_KEY=... python scripts/update_market_quotes.py
Symbols may require a market-data entitlement; 9 markets are NOT guaranteed.
Futures TX is deliberately omitted until a separate licensed futures feed is configured.
"""
import json, os, pathlib, urllib.parse, urllib.request, datetime
from zoneinfo import ZoneInfo
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'market-quotes.json'
API_KEY = os.environ.get('TWELVEDATA_API_KEY', '')
if not API_KEY:
    print('No market API key; leaving existing quotes unchanged')
    raise SystemExit(0)
# The provider's official symbols/entitlements must be verified before publishing.
# Indices can be premium-only; do not fake unsupported results.
SESSIONS = {
    'TAIEX': ('Asia/Taipei', 540, 810),
    'SPX': ('America/New_York', 570, 960),
    'IXIC': ('America/New_York', 570, 960),
    'DJI': ('America/New_York', 570, 960),
    'SOX': ('America/New_York', 570, 960),
    'N225': ('Asia/Tokyo', 540, 930),
    'KS11': ('Asia/Seoul', 540, 930),
    'STOXX50E': ('Europe/Berlin', 540, 1050),
}
def active_market(index):
    z, begin, end = SESSIONS[index]
    local = datetime.datetime.now(ZoneInfo(z))
    if local.weekday() > 4: return False
    minute = local.hour*60 + local.minute
    # Refresh through 45 minutes after close for the final closing snapshot.
    return begin <= minute <= end+45
SYMBOLS = {
    'TAIEX': 'TWII', 'SPX': 'SPX', 'IXIC': 'IXIC', 'DJI': 'DJI',
    'SOX': 'SOX', 'N225': 'N225', 'KS11': 'KS11', 'STOXX50E': 'STOXX50E'
}
current = json.loads(OUT.read_text()) if OUT.exists() else {'items': {}}
items = current.get('items', {})
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
changed = 0
for idx, symbol in SYMBOLS.items():
    if not active_market(idx):
        print(f'{idx}: market outside scheduled session, skipped')
        continue
    try:
        url = 'https://api.twelvedata.com/quote?' + urllib.parse.urlencode({'symbol':symbol,'apikey':API_KEY})
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'KomorebiMarketResearch/1.0'}), timeout=15) as response:
            payload = json.load(response)
        if payload.get('status') == 'error' or not payload.get('close'):
            print(f'{idx}: unavailable/entitlement missing: {payload.get("message", "missing close")}')
            continue
        price, opening = float(payload['close']), float(payload.get('open') or 0)
        if price<=0: continue
        asof=payload.get('datetime','')
        # 'datetime' may be exchange local without timezone: store fetch time separately.
        items[idx] = {'price':price,'open':opening if opening>0 else None,
                      'asOf':now,'marketTime':asof,'fetchedAt':now,'source':'Twelve Data'}
        changed += 1
    except Exception as exc:
        print(f'{idx}: not updated: {exc}')
if changed:
    OUT.write_text(json.dumps({'updatedAt':now,'items':items,'notice':'Check each market feed licence and timestamps'},ensure_ascii=False,indent=2)+'\n')
print('updated',changed,'quotes')
