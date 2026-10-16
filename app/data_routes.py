"""History, reports and portability HTTP interface."""
import json
from fastapi import APIRouter,File,UploadFile
from fastapi.responses import Response
from . import database,portability,reports,tracking

def router(manager):
    r=APIRouter()

    @r.get('/api/storage')
    def storage():
        return database.info()

    @r.get('/api/jobs/{jid}/sessions')
    def sessions(jid:str):
        manager.get(jid);return database.runs(jid)

    @r.get('/api/jobs/{jid}/report')
    def report(jid:str,format:str='json'):
        data=portability.redact(reports.report(manager,jid));name=data['job']['name']
        if format=='csv':body=reports.csv_metrics(data);media='text/csv';ext='csv'
        elif format=='html':body=reports.html_report(data);media='text/html';ext='html'
        elif format=='md':body=reports.markdown(data);media='text/markdown';ext='md'
        elif format=='json':body=json.dumps(portability.redact(data),indent=2,ensure_ascii=False);media='application/json';ext='json'
        else:raise ValueError('Format report: json, csv, md, html.')
        return Response(body,media_type=media,headers={'Content-Disposition':f'attachment; filename="{name}_report.{ext}"'})

    @r.get('/api/portability/export')
    def export():
        return Response(portability.export_bundle(),media_type='application/zip',headers={'Content-Disposition':'attachment; filename="adexe-history.zip"'})

    @r.post('/api/portability/import')
    async def restore(file:UploadFile=File(...)):
        blob=await file.read(32_000_001)
        if len(blob)>32_000_000:raise ValueError('Ukuran ZIP maksimum 32 MB.')
        return portability.restore_bundle(blob)

    @r.post('/api/portability/remap')
    def remap(data:dict):
        return portability.rebind(data.get('old_root',''),data.get('new_root',''),bool(data.get('apply')))

    @r.post('/api/datasets/{name}/snapshot')
    def snapshot(name:str):return tracking.dataset_version(name)

    @r.get('/api/datasets/{name}/versions')
    def versions(name:str):
        with database.connect() as c:
            return [dict(x) for x in c.execute('SELECT id,dataset,created,signature FROM dataset_versions WHERE dataset=? ORDER BY created DESC',(name,))]

    return r
