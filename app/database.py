"""SQLite repository. JSON files are migration inputs, not a second source of truth."""
import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from .config import DATA_DIR, JOBS_DIR, DATASETS_DIR, SETTINGS_FILE

DB_PATH = DATA_DIR / "studio.sqlite3"
_ready = False
_lock = threading.RLock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,model TEXT,status TEXT,dataset TEXT,created REAL,updated REAL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS datasets(name TEXT PRIMARY KEY,metadata TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dataset_versions(id TEXT PRIMARY KEY,dataset TEXT,created REAL,signature TEXT,manifest TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,started REAL,finished REAL,status TEXT,snapshot TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS metrics(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT,job_id TEXT,step INTEGER,loss REAL,lr REAL,group_lrs TEXT,t REAL,nan INTEGER DEFAULT 0,UNIQUE(run_id,step));
CREATE INDEX IF NOT EXISTS metric_job_step ON metrics(job_id,step);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT,run_id TEXT,t REAL,kind TEXT,payload TEXT);
"""

@contextmanager
def connect():
    initialize()
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    try:
        with con: yield con
    finally: con.close()

def initialize():
    global _ready
    if _ready: return
    with _lock:
        if _ready: return
        con = sqlite3.connect(DB_PATH, timeout=30)
        try:
            con.execute("PRAGMA journal_mode=WAL")
            con.executescript(SCHEMA)
            if not con.execute("SELECT 1 FROM meta WHERE key='legacy_import'").fetchone():
                with con:
                    if SETTINGS_FILE.exists():
                        for k,v in json.loads(SETTINGS_FILE.read_text(encoding="utf-8")).items():
                            con.execute("INSERT OR IGNORE INTO settings VALUES(?,?)",(k,json.dumps(v)))
                    for p in JOBS_DIR.glob("*/job.json"):
                        job=json.loads(p.read_text(encoding="utf-8"))
                        if job.get("status") in ("queued","running"):job['status']='stopped'
                        _put_job(con,job)
                        mp=p.parent/'metrics.jsonl'
                        if mp.exists():
                            rid='legacy_'+job['id']
                            con.execute("INSERT OR IGNORE INTO runs VALUES(?,?,?,?,?,?)",(rid,job['id'],job.get('started'),job.get('finished'),'imported',json.dumps({'source':'legacy_jsonl','params':job['params'],'historical':True})))
                            for line in mp.read_text(encoding='utf-8').splitlines():
                                try: _metric(con,job['id'],rid,json.loads(line))
                                except (ValueError,KeyError): pass
                    for p in DATASETS_DIR.glob('*/dataset.json'):
                        con.execute("INSERT OR IGNORE INTO datasets VALUES(?,?)",(p.parent.name,p.read_text(encoding='utf-8')))
                    con.execute("INSERT INTO meta VALUES('legacy_import',?)",(str(time.time()),))
                    con.execute("INSERT OR REPLACE INTO meta VALUES('schema_version','1')")
            con.commit(); _ready=True
        finally:con.close()

def _put_job(c,j):
    c.execute("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,model=excluded.model,status=excluded.status,dataset=excluded.dataset,updated=excluded.updated,payload=excluded.payload",(j['id'],j['name'],j['model'],j['status'],j['dataset'],j['created'],time.time(),json.dumps(j,ensure_ascii=False)))

def put_job(job):
    with connect() as c: _put_job(c,job)

def get_job(jid):
    with connect() as c: row=c.execute("SELECT payload FROM jobs WHERE id=?",(jid,)).fetchone()
    if row is None:raise FileNotFoundError(jid)
    return json.loads(row[0])

def list_jobs():
    with connect() as c:return [json.loads(r[0]) for r in c.execute("SELECT payload FROM jobs ORDER BY created DESC")]

def delete_job(jid):
    with connect() as c:
        for table in ('metrics','events','runs'):c.execute(f"DELETE FROM {table} WHERE job_id=?",(jid,))
        c.execute('DELETE FROM jobs WHERE id=?',(jid,))

def settings():
    with connect() as c:return {r[0]:json.loads(r[1]) for r in c.execute('SELECT key,value FROM settings')}

def save_settings(values):
    with connect() as c:
        c.executemany('INSERT OR REPLACE INTO settings VALUES(?,?)',[(k,json.dumps(v)) for k,v in values.items()])

def dataset_meta(name):
    with connect() as c:r=c.execute('SELECT metadata FROM datasets WHERE name=?',(name,)).fetchone()
    return json.loads(r[0]) if r else None

def put_dataset(name,meta):
    with connect() as c:c.execute('INSERT OR REPLACE INTO datasets VALUES(?,?)',(name,json.dumps(meta,ensure_ascii=False)))

def _metric(c,jid,rid,m):
    c.execute('INSERT OR REPLACE INTO metrics(run_id,job_id,step,loss,lr,group_lrs,t,nan) VALUES(?,?,?,?,?,?,?,?)',(rid,jid,m['step'],m.get('loss'),m.get('lr'),json.dumps(m.get('group_lrs') or {}),m.get('t',time.time()),int(bool(m.get('nan')))))

def add_metric(jid,rid,m):
    with connect() as c:_metric(c,jid,rid,m)

def metrics(jid):
    with connect() as c:
        return [{**dict(r),'group_lrs':json.loads(r['group_lrs'] or '{}'),'nan':bool(r['nan'])} for r in c.execute('SELECT run_id,step,loss,lr,group_lrs,t,nan FROM metrics WHERE job_id=? ORDER BY t,id',(jid,))]

def start_run(jid,rid,snapshot):
    with connect() as c:c.execute('INSERT INTO runs VALUES(?,?,?,?,?,?)',(rid,jid,time.time(),None,'running',json.dumps(snapshot,ensure_ascii=False)))

def finish_run(rid,status):
    with connect() as c:c.execute('UPDATE runs SET status=?,finished=? WHERE id=?',(status,time.time(),rid))

def runs(jid):
    with connect() as c:return [{**dict(r),'snapshot':json.loads(r['snapshot'])} for r in c.execute('SELECT * FROM runs WHERE job_id=? ORDER BY started',(jid,))]

def event(jid,rid,kind,payload):
    with connect() as c:c.execute('INSERT INTO events(job_id,run_id,t,kind,payload) VALUES(?,?,?,?,?)',(jid,rid,time.time(),kind,json.dumps(payload,ensure_ascii=False)))

def info():
    with connect() as c:
        counts={t:c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in ('jobs','datasets','runs','metrics','dataset_versions')}
    return {'engine':'SQLite','schema_version':1,'path':str(DB_PATH),'counts':counts}
