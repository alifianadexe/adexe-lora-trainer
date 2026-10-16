"""Portable history bundles and explicit machine path rebinding."""
import copy
import io
import json
import sqlite3
import time
import zipfile
import re
import yaml
from pathlib import Path
from . import database
from .config import DATA_DIR, DATASETS_DIR, JOBS_DIR, load_settings, save_settings

TABLES=('jobs','datasets','dataset_versions','runs','metrics','events')
SECRETS=('hf_token','caption_api_key')

def redact(value):
    if isinstance(value,dict):
        result={}
        for k,v in value.items():
            if k.lower() in ('hf_token','caption_api_key','api_key','access_token','auth_token','authorization','password','secret','token') or k.lower().endswith(('_password','_secret','_api_key','_access_token')):v=''
            elif k=='config' and isinstance(v,str):
                try:v=yaml.safe_dump(redact(yaml.safe_load(v)),allow_unicode=True)
                except yaml.YAMLError:v='Config text omitted from portable history.'
            else:v=redact(v)
            result[k]=v
        return result
    if isinstance(value,list):return [redact(v) for v in value]
    return value

def export_bundle():
    with database.connect() as c:
        c.execute('BEGIN')
        data={t:[dict(r) for r in c.execute(f'SELECT * FROM {t}')] for t in TABLES}
    # Nested JSON payloads can contain custom config credentials; redact recursively.
    for table,rows in data.items():
        for row in rows:
            for k in ('payload','snapshot','metadata','manifest'):
                if row.get(k):row[k]=json.dumps(redact(json.loads(row[k])),ensure_ascii=False)
    data.update(format='adexe-history',version=1,created=time.time(),settings={k:v for k,v in load_settings().items() if k not in SECRETS},
                includes_assets=False,notes='History only. Copy datasets, model weights and output folders separately, then remap paths.')
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('studio-history.json',json.dumps(data,ensure_ascii=False))
        z.writestr('README.txt','Adexe portable history v1\nImport this ZIP in Studio > Data & LAN.\nNo image assets, checkpoints, environments, or API credentials included. Copy them separately and remap old/new workspace paths.\n')
    return stream.getvalue()

def restore_bundle(blob):
    try:
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            info=z.getinfo('studio-history.json')
            if info.file_size>150_000_000:raise ValueError('History terlalu besar (maksimum 150 MB).')
            data=json.loads(z.read(info))
    except (zipfile.BadZipFile,KeyError,UnicodeError,json.JSONDecodeError) as e:raise ValueError('Bundle history tidak valid.') from e
    if data.get('format')!='adexe-history' or data.get('version')!=1:raise ValueError('Versi bundle tidak didukung.')
    for row in data.get('jobs',[]):
        j=json.loads(row['payload'])
        if not re.fullmatch(r'[a-f0-9]{12}',row['id']) or j['id']!=row['id'] or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',j['name']):raise ValueError('Identitas job di bundle tidak valid.')
    if any(not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',r['name']) for r in data.get('datasets',[])):raise ValueError('Nama dataset di bundle tidak valid.')
    for j in database.list_jobs():
        if j['status'] in ('running','queued'):raise ValueError('Hentikan antrean/training sebelum mengimpor history.')
    with database.connect() as c:
        if c.execute('SELECT COUNT(*) FROM jobs').fetchone()[0]:raise ValueError('Impor history membutuhkan workspace kosong agar riwayat lokal tidak tertimpa. Gunakan LORA_STUDIO_DATA ke folder baru.')
        for table in TABLES:
            columns=[r[1] for r in c.execute(f'PRAGMA table_info({table})')]
            for row in data.get(table,[]):
                if table=='jobs':
                    j=json.loads(row['payload']);j['status']='stopped' if j['status'] in ('running','queued') else j['status'];j.pop('pid',None)
                    row['status']=j['status'];row['payload']=json.dumps(j)
                if table=='runs' and row.get('status')=='running':row['status']='interrupted'
                keys=[k for k in columns if k in row and k!='id'] if table in ('metrics','events') else [k for k in columns if k in row]
                c.execute(f"INSERT INTO {table}({','.join(keys)}) VALUES({','.join('?' for _ in keys)})",[row[k] for k in keys])
    for row in data.get('datasets',[]):(DATASETS_DIR/row['name']).mkdir(parents=True,exist_ok=True)
    for j in database.list_jobs():(JOBS_DIR/j['id']).mkdir(parents=True,exist_ok=True)
    # Paths are machine-specific: restore non-secret settings but require explicit rebind.
    save_settings({k:v for k,v in data.get('settings',{}).items() if k not in SECRETS})
    return {'jobs':len(data.get('jobs',[])),'assets_included':False,'message':'History diimpor. Petakan ulang lokasi workspace dan backend sebelum menjalankan training.'}

PATH_KEYS={'folder_path','training_folder','control_path_1','control_path_2','control_path_3','ctrl_img','ctrl_img_1','ctrl_img_2','ctrl_img_3','sample_control_1','sample_control_2','base_model_path','output_root','source_config','linked_path','name_or_path','vae_path','text_encoder_path','ai_toolkit_path','ai_toolkit_python','sd_scripts_path','sd_scripts_python','anima_dit_path','anima_qwen3_path','anima_vae_path'}

def rebind(old,new,apply=False):
    old=old.replace('\\','/').rstrip('/');new=new.replace('\\','/').rstrip('/')
    if len(old)<4 or not Path(new).is_absolute() or not Path(new).is_dir():raise ValueError('Isi root lama dan folder root baru yang valid. Root lama tidak boleh hanya huruf drive.')
    changes=[]
    needs_sd_scripts=any(j['backend']=='sd-scripts' for j in database.list_jobs())
    def walk(value,where=''):
        if isinstance(value,list):return [walk(v,where+f'/{i}') for i,v in enumerate(value)]
        if not isinstance(value,dict):return value
        result={}
        for k,v in value.items():
            if k in PATH_KEYS and isinstance(v,str):
                normalized=v.replace('\\','/')
                if normalized.lower()==old.lower() or normalized.lower().startswith(old.lower()+'/'):
                    optional=(k.startswith('sd_scripts_') or k.startswith('anima_')) and not needs_sd_scripts
                    candidate=new+normalized[len(old):];changes.append({'field':where+'/'+k,'old':v,'new':candidate,'exists':Path(candidate).exists(),'required':not optional});v=candidate
            result[k]=walk(v,where+'/'+k)
        return result
    jobs=[walk(copy.deepcopy(j),'job/'+j['id']) for j in database.list_jobs()]
    with database.connect() as c:ds=[(r['name'],walk(json.loads(r['metadata']),'dataset/'+r['name'])) for r in c.execute('SELECT * FROM datasets')]
    settings=walk(load_settings(),'settings')
    if apply:
        if any(j['status'] in ('running','queued') for j in jobs):raise ValueError('Hentikan training sebelum mengganti path.')
        if any(not x['exists'] and x['required'] for x in changes):raise ValueError('Ada lokasi tujuan yang belum tersedia. Salin aset dahulu lalu ulangi preview.')
        # All writes commit together; run snapshots stay historical and are not rewritten.
        with database.connect() as c:
            for j in jobs:database._put_job(c,j)
            for name,meta in ds:c.execute('UPDATE datasets SET metadata=? WHERE name=?',(json.dumps(meta),name))
            for k,v in settings.items():c.execute('INSERT OR REPLACE INTO settings VALUES(?,?)',(k,json.dumps(v)))
    return {'applied':apply,'changes':changes,'historical_snapshots_unchanged':True}
