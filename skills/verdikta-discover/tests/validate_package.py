#!/usr/bin/env python3
"""Validate local handoff artifacts only. No network, wallets, or model execution.

Requires PyYAML and jsonschema. Does not claim native OpenClaw/Hermes compatibility.
Rubric validation below implements the inspected server rules, not the whole server.
"""
from __future__ import annotations
import copy
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import sys
import yaml
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
checks: list[dict] = []
def load(path: str):
    return json.loads((ROOT/path).read_text())
def check(name: str, predicate: bool):
    checks.append({'name': name, 'passed': bool(predicate)})
def valid(kind: str, data: dict) -> bool:
    schema = load('schemas/'+kind+'.schema.json')
    return not list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(data))
def rubric_valid(r: dict) -> bool:
    """Inspected structural rules, with explicit boolean/number separation."""
    cs=r.get('criteria'); ids=set(); total=0.0
    if not isinstance(cs,list) or not 1<=len(cs)<=10:return False
    for c in cs:
        if not isinstance(c.get('id'),str) or not c['id'] or c['id'] in ids:return False
        ids.add(c['id'])
        if type(c.get('must')) is not bool:return False
        if type(c.get('weight')) not in (int,float) or not 0<=c['weight']<=1:return False
        if c['must'] and c['weight']!=0:return False
        if not c['must']:total+=c['weight']
        if not isinstance(c.get('description'),str) or not c['description']:return False
    if abs(total-1.0)>0.001 and total!=0:return False
    if 'forbidden_content' in r and not isinstance(r['forbidden_content'],list):return False
    if 'license_template' in r and not isinstance(r['license_template'],str):return False
    return True

def request_valid(kind: str, req: dict) -> bool:
    if not valid(kind+'.request',req):return False
    p=req['source_policy']
    if p['minimum_locations_per_item']>p['max_search_actions_per_item']:return False
    if kind=='source-check-v1':
        return len({c['claim_id'] for c in req['claims']})==len(req['claims'])
    return (len({e['entity_id'] for e in req['entities']})==len(req['entities'])
            and len({f['field_id'] for f in req['fields']})==len(req['fields'])
            and len(req['entities'])*len(req['fields'])<=50)

def pair_valid(kind: str, req: dict, result: dict, request_bytes: bytes, production: bool=False) -> bool:
    if not request_valid(kind,req) or not valid(kind+'.result',result):return False
    if result['task_id']!=req['task_id']:return False
    if result['input_sha256']!=hashlib.sha256(request_bytes).hexdigest():return False
    if result['fixture_only']!=req['fixture_only']:return False
    if production and (req['fixture_only'] or result['fixture_only']):return False
    sources=result['sources']; source_ids={s['source_id'] for s in sources}
    if len(sources)!=len(source_ids):return False
    if production and any(s['provenance']=='SYNTHETIC_FIXTURE' for s in sources):return False
    rows=result['claims'] if kind=='source-check-v1' else result['cells']
    if kind=='source-check-v1':
        expected={c['claim_id'] for c in req['claims']};actual=[c['claim_id'] for c in rows]
    else:
        expected={(e['entity_id'],f['field_id']) for e in req['entities'] for f in req['fields']}
        actual=[(c['entity_id'],c['field_id']) for c in rows]
    if set(actual)!=expected or len(actual)!=len(expected):return False
    for row in rows:
        refs=list(row['evidence_ids'])
        for a in row.get('alternatives',[]):refs+=a['evidence_ids']
        if not set(refs)<=source_ids:return False
        # Structural effort limits only; actual truthfulness is not tested here.
        if len(row['effort'])>req['source_policy']['max_search_actions_per_item']:return False
        if kind=='evidence-pack-v1':
            field=next(f for f in req['fields'] if f['field_id']==row['field_id'])
            values=([row['value']] if row['status']=='FOUND' else [a['value'] for a in row['alternatives']])
            ty=field['value_type']
            for v in values:
                if ty=='string' and type(v) is not str:return False
                if ty=='number' and type(v) not in (int,float):return False
                if ty=='boolean' and type(v) is not bool:return False
    return True

# All JSON must parse; all schemas must be valid Draft 2020-12 schemas.
json_paths=sorted(p for folder in ['schemas','templates','examples','tests'] for p in (ROOT/folder).glob('*.json'))
for p in json_paths:
    if p.name in {'test-report.json','package-manifest.json'}:continue
    try:json.loads(p.read_text());ok=True
    except Exception:ok=False
    check('JSON parses: '+str(p.relative_to(ROOT)),ok)
for p in sorted((ROOT/'schemas').glob('*.json')):
    try:Draft202012Validator.check_schema(json.loads(p.read_text()));ok=True
    except Exception:ok=False
    check('Schema valid: '+p.name,ok)

skill=(ROOT/'SKILL.md').read_text()
front=yaml.safe_load(skill.split('---',2)[1])
check('Portable skill name matches directory',front['name']=='verdikta-discover')
check('Description is concise and within 1024 characters',0<len(front['description'])<=1024)
check('No metadata prerequisite gate in new discovery skill','metadata' not in front)
check('No wallet/API-key runtime prerequisites in discovery frontmatter',not any(k in str(front) for k in ['VERDIKTA_WALLET_PASSWORD','VERDIKTA_KEYSTORE_PATH','requires']))

refs=re.findall(r'`(references/[^`]+\.md)`',skill)
check('All referenced skill documents exist',bool(refs) and all((ROOT/p).is_file() for p in refs))
check('New skill has no dependency gate under documented metadata model','metadata' not in front)

for kind in ['source-check-v1','evidence-pack-v1']:
    rubric=load(f'templates/{kind}.rubric.json')
    check(kind+': inspected rubric shape rules pass',rubric_valid(rubric))
    check(kind+': scored weights sum to one',abs(sum(c['weight'] for c in rubric['criteria'] if not c['must'])-1)<1e-9)
    check(kind+': threshold outside rubric','threshold' not in rubric)
    bad=copy.deepcopy(rubric);bad['criteria'][0]['weight']=0.5
    check(kind+': rejects nonzero must-pass weight',not rubric_valid(bad))
    req=load(f'examples/{kind}.request.json');res=load(f'examples/{kind}.result.json');raw=(ROOT/f'examples/{kind}.request.json').read_bytes()
    check(kind+': request example validates',request_valid(kind,req))
    check(kind+': result and manifest binding validate',pair_valid(kind,req,res,raw))
    check(kind+': synthetic example rejected for production',not pair_valid(kind,req,res,raw,production=True))
    bad=copy.deepcopy(res);bad['task_id']='different-task'
    check(kind+': rejects mismatched task ID',not pair_valid(kind,req,bad,raw))
    bad=copy.deepcopy(res);bad['input_sha256']='0'*64
    check(kind+': rejects changed input digest',not pair_valid(kind,req,bad,raw))
    key='claims' if kind=='source-check-v1' else 'cells'
    bad=copy.deepcopy(res);bad[key].pop()
    check(kind+': rejects missing required item',not pair_valid(kind,req,bad,raw))
    bad=copy.deepcopy(res);bad[key].append(copy.deepcopy(bad[key][0]))
    check(kind+': rejects duplicated result item',not pair_valid(kind,req,bad,raw))
    bad=copy.deepcopy(res);bad[key][0]['evidence_ids']=['nonexistent-source']
    check(kind+': rejects unresolved evidence reference',not pair_valid(kind,req,bad,raw))

req=load('examples/evidence-pack-v1.request.json')
req['entities']=[{'entity_id':f'E{x}','name':f'Entity {x}'} for x in range(10)]
req['fields']=[{'field_id':f'F{x}','definition':f'Field {x}','value_type':'string'} for x in range(10)]
check('Evidence pack rejects 100-cell request beyond 50-cell cap',not request_valid('evidence-pack-v1',req))
preview=load('examples/preview.json');check('Draft preview example validates',valid('preview',preview))
bad=copy.deepcopy(preview);bad['can_commission']=True
check('Draft preview rejects commissioning authority',not valid('preview',bad))
bad=copy.deepcopy(preview);bad['costs']['reward_wei']='0'
check('Draft preview rejects invented zero quote',not valid('preview',bad))
check('Behavior fixture suite contains 30 unique case IDs',len(load('tests/behavior-cases.json')['cases'])==30 and len({c['id'] for c in load('tests/behavior-cases.json')['cases']})==30)
check('Behavior suite explicitly marked NOT_RUN',load('tests/behavior-cases.json')['status']=='NOT_RUN')
report={'scope':'Local artifact/schema validation and documented metadata-gating simulation only. No native runtimes, LLM sessions, live API verification, blockchain calls, or adjudication tests.',
        'passed':sum(x['passed'] for x in checks),'failed':sum(not x['passed'] for x in checks),'checks':checks,
        'behavioral_cases_run':0,'behavioral_cases_authored':30,'native_loader_tests':'NOT_RUN',
        'dependencies':{k:importlib.metadata.version(k) for k in ['PyYAML','jsonschema']}}

print(json.dumps({k:v for k,v in report.items() if k!='checks'},indent=2))
for c in checks:
    if not c['passed']:print('FAIL:',c['name'])
sys.exit(0 if report['failed']==0 else 1)
