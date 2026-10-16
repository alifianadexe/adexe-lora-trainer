"""Downloadable training evidence, separate from interpretation."""
import csv
import html
import io
import json
import time
import base64
from pathlib import Path
from PIL import Image
from . import database

def report(manager,jid):
    j=manager.get(jid);metrics=manager.metrics(jid);runs=database.runs(jid);out=manager.outputs(jid)
    losses=[m['loss'] for m in metrics if m.get('loss') is not None]
    return {'schema':1,'generated_at':time.time(),'job':j,'sessions':runs,'metrics':metrics,'outputs':out,
            'summary':{'saved_step':max([c.get('step') or 0 for c in out['checkpoints']],default=0),
                       'total_steps':j['progress']['total'],'metric_points':len(metrics),'session_count':len(runs),
                       'minimum_observed_loss':min(losses) if losses else None,'evaluated_checkpoints':len(j.get('evaluations',{}))},
            'limits':['Loss historis hanya tersedia bila terekam; tidak direkonstruksi dari checkpoint.',
                      'LR per grup hanya dicatat jika backend mengeluarkannya di log; bukan LR per bobot.',
                      'Sample dan loss tidak membuktikan generalisasi. Gunakan eval terpisah dan prompt/seed yang sama.',
                      'Dataset versi disalin sebagai manifest dan hash; gambar asli tetap berupa file.']}

def csv_metrics(data):
    stream=io.StringIO(newline='');w=csv.writer(stream)
    w.writerow(['run_id','step','loss','lr_observed','group_lrs','timestamp','nan'])
    for m in data['metrics']:w.writerow([m.get('run_id'),m['step'],m.get('loss'),m.get('lr'),json.dumps(m.get('group_lrs',{})),m.get('t'),m.get('nan')])
    return '\ufeff'+stream.getvalue()

def markdown(data):
    j=data['job'];s=data['summary']
    text=f"# Training report: {j['name']}\n\nModel: {j['model']} · status: {j['status']}\n\nCheckpoint tersimpan: {s['saved_step']}/{s['total_steps']}\n\n## Parameter\n\n| Parameter | Nilai |\n|---|---|\n"
    for k,v in j['params'].items():
        if k=='sample_prompts':continue
        text+=f"| {k} | {str(v).replace('|','/')} |\n"
    text+='\n## Sesi training\n\n'
    for run in data['sessions']:
        sn=run['snapshot'];version=sn.get('dataset_version',{})
        text+=f"- {run['id']}: {run['status']}; dataset versi `{version.get('signature','legacy / tidak tersedia')}`; mesin `{sn.get('machine','tidak tersedia')}`.\n"
    text+='\n## Evaluasi checkpoint\n\n'+json.dumps(j.get('evaluations',{}),indent=2,ensure_ascii=False)+'\n\n## Batas interpretasi\n\n'
    return text+'\n'.join('- '+s for s in data['limits'])+'\n'

def html_report(data):
    esc=html.escape;j=data['job'];s=data['summary']
    params=''.join('<tr><td>'+esc(k)+'</td><td>'+esc(str(v))+'</td></tr>' for k,v in j['params'].items() if k!='sample_prompts')
    points=[m for m in data['metrics'] if m.get('loss') is not None];svg=''
    if points:
        lo=min(m['loss'] for m in points);hi=max(m['loss'] for m in points);total=max(m['step'] for m in points) or 1
        coords=' '.join(f"{20+760*m['step']/total:.1f},{180-150*(m['loss']-lo)/(hi-lo or 1):.1f}" for m in points)
        svg=f'<svg viewBox="0 0 800 210" role="img" aria-label="Observed loss"><polyline fill="none" stroke="#2563eb" stroke-width="2" points="{coords}"/></svg><p>Loss aktual • {len(points)} observasi</p>'
    else:svg='<p>Belum ada riwayat loss tercatat.</p>'
    provenance=''
    for run in data['sessions']:
        sn=run['snapshot'];version=sn.get('dataset_version',{})
        provenance+='<details><summary>'+esc(run['id'])+' · '+esc(run['status'])+'</summary><p>Dataset SHA256: '+esc(version.get('signature','Tidak tercatat pada riwayat lama'))+'</p><p>Mesin: '+esc(sn.get('machine','Tidak tercatat'))+'</p><pre>'+esc(json.dumps(sn.get('params',{}),indent=2,ensure_ascii=False))+'</pre></details>'
    previews='';root=Path(data['outputs']['root']).resolve()
    for sample in data['outputs']['samples'][-6:]:
        path=(root/sample['file']).resolve()
        if root not in path.parents:continue
        try:
            with Image.open(path) as im:
                im=im.convert('RGB');im.thumbnail((300,500));out=io.BytesIO();im.save(out,format='JPEG',quality=85)
            previews+='<figure><img src="data:image/jpeg;base64,'+base64.b64encode(out.getvalue()).decode()+'"><figcaption>Step '+str(sample['step'])+' · prompt '+str(sample['index']+1)+'</figcaption></figure>'
        except (OSError,ValueError):pass
    return '<!doctype html><meta charset="utf-8"><title>Training report</title><style>body{max-width:960px;margin:40px auto;padding:20px;font:15px system-ui;color:#17263c;background:#f5f7fa}section{background:white;padding:24px;border:1px solid #dfe5ed;border-radius:16px;margin:20px 0}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #eee;overflow-wrap:anywhere}h1{font-size:30px}svg{width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}.previews{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}figure{margin:0}img{width:100%}figcaption{font-size:11px;margin:8px 0}details{padding:12px 0;border-bottom:1px solid #eee}@media print{body{background:white;margin:0}section{break-inside:avoid}}</style>'+f'<h1>{esc(j["name"])}</h1><p>{esc(j["model"])} · {esc(j["status"])}</p><section><h2>{s["saved_step"]} / {s["total_steps"]} langkah tersimpan</h2><p>{s["session_count"]} sesi · {s["metric_points"]} metrik · {s["evaluated_checkpoints"]} checkpoint dinilai</p>{svg}</section><section><h2>Parameter eksperimen</h2><table>{params}</table></section><section><h2>Sesi & versi dataset</h2>{provenance}</section><section><h2>Sample terakhir</h2><div class="previews">{previews}</div></section><section><h2>Evaluasi</h2><pre>'+esc(json.dumps(j.get('evaluations',{}),indent=2,ensure_ascii=False))+'</pre></section><section><h2>Catatan interpretasi</h2><ul>'+''.join('<li>'+esc(v)+'</li>' for v in data['limits'])+'</ul></section>'

def save_artifacts(manager,jid,session='current'):
    from .portability import redact
    from .config import DATA_DIR
    data=redact(report(manager,jid));folder=DATA_DIR/'reports'/jid;folder.mkdir(parents=True,exist_ok=True)
    for ext,body in [('json',json.dumps(data,indent=2,ensure_ascii=False)),('md',markdown(data)),('csv',csv_metrics(data)),('html',html_report(data))]:
        (folder/f'{session}.{ext}').write_text(body,encoding='utf-8')
    return folder
