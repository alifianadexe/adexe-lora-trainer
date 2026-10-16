"""Immutable dataset/run provenance, captured before launching a trainer."""
import hashlib
import json
import platform
import socket
import subprocess
import time
import uuid
import yaml
from pathlib import Path
from . import database, datasets
from .config import load_settings

def dataset_version(name):
    root=datasets.dataset_dir(name)
    files=[]; digest=hashlib.sha256()
    for p in datasets.images_in(root):
        caption=p.with_suffix('.txt').read_text(encoding='utf-8',errors='replace') if p.with_suffix('.txt').exists() else ''
        with p.open('rb') as f: image_hash=hashlib.file_digest(f,'sha256').hexdigest()
        item={'file':p.name,'sha256':image_hash,'bytes':p.stat().st_size,'caption':caption}
        digest.update(json.dumps(item,sort_keys=True,ensure_ascii=False).encode());files.append(item)
    signature=digest.hexdigest();vid=signature[:24]
    manifest={'dataset':name,'path_at_capture':str(root),'count':len(files),'files':files,'hash':'sha256'}
    with database.connect() as c:
        c.execute('INSERT OR IGNORE INTO dataset_versions VALUES(?,?,?,?,?)',(vid,name,time.time(),signature,json.dumps(manifest,ensure_ascii=False)))
    return {'id':vid,'signature':signature,'count':len(files)}

def snapshot(job,config_text):
    version=dataset_version(job['dataset'])
    paired=[]
    cfg=job.get('imported_config') or (yaml.safe_load(config_text) if isinstance(config_text,str) else {}) or {}
    for d in cfg.get('config',{}).get('process',[{}])[0].get('datasets',[]):
        for key in ('control_path_1','control_path_2'):
            if not d.get(key):continue
            entries=[];h=hashlib.sha256()
            for p in sorted(Path(d[key]).glob('*')):
                if p.is_file() and p.suffix.lower() in datasets.IMG_EXT:
                    with p.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
                    entries.append({'file':p.name,'sha256':sha});h.update((p.name+sha).encode())
            paired.append({'role':key,'path_at_capture':d[key],'signature':h.hexdigest(),'files':entries})
    backend=load_settings().get('ai_toolkit_path','')
    try:
        revision=subprocess.run(['git','-C',backend,'rev-parse','HEAD'],capture_output=True,text=True,timeout=5).stdout.strip()
    except (OSError,subprocess.SubprocessError):revision=None
    return {'schema':1,'job_id':job['id'],'params':job['params'],'config':config_text,'dataset_version':version,'controls':paired,
            'model':job['model'],'backend':job['backend'],'backend_revision':revision,'machine':socket.gethostname(),
            'os':platform.platform(),'studio_python':platform.python_version(),'backend_python':load_settings().get('ai_toolkit_python' if job['backend']=='ai-toolkit' else 'sd_scripts_python'),
            'output_root':job.get('output_root'),'lr_note':'lr is observed from trainer stdout. Per-group LR is null unless the trainer explicitly logs it.'}
