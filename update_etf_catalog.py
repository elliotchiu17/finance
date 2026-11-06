#!/usr/bin/env python3
"""Rebuild TWSE ETF catalog from official listing (and official ISIN fallback).

Execution is intended for GitHub Actions (internet access needed). Fail closed:
no file is replaced unless sanity checks pass. No guessed custodian banks.
"""
import json,re,sys,datetime,io
from pathlib import Path
import requests
from bs4 import BeautifulSoup
import pandas as pd

BASE=Path(__file__).resolve().parents[1]
DATA=BASE/'etf-data.json'
URLS=[
 'https://www.twse.com.tw/zh/products/securities/etf/products/list.html',
 'https://wwwc.twse.com.tw/zh/products/securities/etf/products/list.html',
]
ISIN='https://isin.twse.com.tw/isin/C_public.jsp?strMode=2'
H={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36','Accept-Language':'zh-TW,zh;q=0.9,en;q=0.5'}
session=requests.Session();session.headers.update(H)
CODE=re.compile(r'^00[0-9A-Z]{2,5}$')

def clean(s):
 return re.sub(r'\s+',' ',str(s or '').replace('\u3000',' ')).strip()

def rowtype(code,name,index):
 name=clean(name);idx=clean(index)
 if code.endswith('L') or code.endswith('R') or '正2' in name or '反1' in name:return '槓桿反向'
 if code.endswith('U') or '期貨' in name:return '期貨型'
 if code.endswith('B') or '債券' in name or '公司債' in name or '公債' in name or '非投等債' in name or '投等債' in name:return '債券及固定收益'
 if code.endswith('T') or '平衡' in name or '多資產' in name:return '多資產'
 if name.startswith('主動') or code.endswith('A') or code.endswith('D'):
  return '主動式'
 abroad=['美國','全球','日本','中國','A股','印度','越南','新興','歐洲','亞太','臺韓','台韓','日經','納斯達克','NASDAQ','標普','恒生','富時越南','FANG','海外','北美','韓國','世界']
 if any(v in name for v in abroad):return '海外股票'
 if any(v in idx.upper() for v in ['S&P 500','NASDAQ','MSCI WORLD','FTSE JAPAN']):return '海外股票'
 return '待確認'  # Do not confuse a missing classification with a proven Taiwan equity exposure.

def normrow(code,name,issuer='',index='',listed=''):
 return {'code':code,'name':name,'issuer':issuer,'index':index,'listed':listed,'type':rowtype(code,name,index),'bank':'','freq':'N/A','latest':'N/A','exdate':'N/A','price':'N/A','ret':'N/A','source':'twse-official'}

def from_twse_html(html):
 soup=BeautifulSoup(html,'html.parser');out={}
 # Never assume the header or table position; locate the code and column header.
 for table in soup.find_all('table'):
  rows=table.find_all('tr')
  if not rows:continue
  headers=[clean(x.get_text(' ',strip=True)) for x in rows[0].find_all(['th','td'])]
  if not any('證券代號' in h for h in headers):continue
  def idx(*words):
   return next((i for i,h in enumerate(headers) if any(w in h for w in words)),-1)
  code_i=idx('證券代號');name_i=idx('證券簡稱','證券名稱');issuer_i=idx('發行人','發行公司');index_i=idx('標的指數');date_i=idx('上市日期')
  if code_i<0 or name_i<0:continue
  for tr in rows[1:]:
   cells=[clean(x.get_text(' ',strip=True)) for x in tr.find_all(['td','th'])]
   if len(cells)<=max(code_i,name_i):continue
   code=cells[code_i].upper().strip();name=cells[name_i]
   if not CODE.fullmatch(code) or not name:continue
   val=lambda i:cells[i] if 0<=i<len(cells) else ''
   out[code]=normrow(code,name,val(issuer_i),val(index_i),val(date_i))
 return out

def from_isin(html):
 # Securities lookup is a fallback to recover all codes if the main listing blocks automation.
 soup=BeautifulSoup(html,'html.parser');out={}
 for tr in soup.find_all('tr'):
  cells=[clean(c.get_text(' ',strip=True)) for c in tr.find_all('td')]
  if len(cells)<6:continue
  match=re.match(r'^(00[0-9A-Z]{2,5})\s+(.+)$',cells[0])
  if not match:continue
  code,name=match.groups()
  if 'ETF' not in ' '.join(cells).upper() and '指數股票' not in ' '.join(cells):continue
  out[code]=normrow(code,name)
  out[code]['source']='twse-isin-official'
 return out

def main():
 old=json.loads(DATA.read_text(encoding='utf-8'))
 existing={x['code']:x for x in old['items']}
 full={}
 errors=[]
 for url in URLS:
  try:
   r=session.get(url,timeout=35);r.raise_for_status()
   found=from_twse_html(r.text)
   print('Official listing:',url, 'items',len(found))
   if len(found)>len(full):full=found
  except Exception as e:errors.append(f'{url}: {e}')
 try:
  r=session.get(ISIN,timeout=35);r.raise_for_status();r.encoding=r.apparent_encoding or 'big5'
  isin=from_isin(r.text)
  print('ISIN fallback:',len(isin))
  # ISIN is not used to overwrite issuer/official listing metadata.
  for code,obj in isin.items():full.setdefault(code,obj)
 except Exception as e: errors.append(f'ISIN: {e}')
 # Minimum expected coverage prevents overwriting healthy data with an anti-bot block page.
 if len(full)<200:
  print('Official fetch incomplete; retained existing catalog. Detected:',len(full), '\n'+'\n'.join(errors),file=sys.stderr)
  sys.exit(1)
 for code,x in full.items():
  prev=existing.get(code,{})
  for f in ('bank','freq','latest','exdate','price','ret'):
   if prev.get(f) and prev[f]!='N/A':x[f]=prev[f]
  if x['type']=='待確認' and prev.get('type') not in ('待確認','其他',None):x['type']=prev['type']
  if not x['issuer']:x['issuer']=prev.get('issuer','')
  if not x['index']:x['index']=prev.get('index','')
  if not x['listed']:x['listed']=prev.get('listed','')
 # User's 00418A may be on the latest page after the data currently indexed; do not invent it.
 result={'meta':{'source':'TWSE official listed ETFs (plus TWSE ISIN fallback where required)','asOf':datetime.date.today().isoformat(),'complete':True,'count':len(full),'note':'保管銀行僅保留已有來源核實值，其餘待查證；此表不含未上市商品。'},'items':sorted(full.values(),key=lambda o:o['code'])}
 DATA.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('Updated',DATA,len(full))

if __name__=='__main__':main()
