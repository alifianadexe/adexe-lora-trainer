"""Integration regressions using synthetic images, temporary storage and a fake GPU engine."""
import io
import json
import os
from pathlib import Path
import queue
import struct
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image, ImageDraw

TEMP = tempfile.TemporaryDirectory()
ROOT = Path(TEMP.name)
os.environ["LORA_STUDIO_DATA"] = str(ROOT / "studio")
os.environ["ADEXE_GENERATION_CONFIG"] = str(ROOT / "generation.json")
refs = ROOT / "references"
refs.mkdir()
for name in ("Alpha", "Beta"):
    im = Image.new("RGB", (768, 1344), "white")
    draw = ImageDraw.Draw(im)
    draw.rectangle((80, 300, 300, 1000), fill="blue")
    draw.ellipse((450, 100, 700, 350), fill="orange")
    im.save(refs / f"{name}.png")
characters = ROOT / "characters.json"
characters.write_text(json.dumps({n: {"hair": "black", "eyes": "brown", "glasses": False, "traits": "", "caption": "black hair, brown eyes"} for n in ("Alpha", "Beta")}), encoding="utf-8")
run = ROOT / "run_v3"
run.mkdir()
(run / "test_000001750.safetensors").touch()
config = {
    "data_dir": str(ROOT / "generation"), "references_dir": str(refs),
    "stage1_loras": [{"id": "test", "label": "test", "path": str(run / "test_000001750.safetensors"), "uses_reference": True, "with_props": True}],
    "stage2_loras": [{"id": "test", "label": "test", "path": str(run / "test_000001750.safetensors")}],
    "sketch2final": {"run_dir": str(run), "default_checkpoint": "test_000001750.safetensors", "characters_file": str(characters), "outputs_dir": str(ROOT / "exports")},
}
Path(os.environ["ADEXE_GENERATION_CONFIG"]).write_text(json.dumps(config), encoding="utf-8")

from fastapi.testclient import TestClient
from app import gpu
from app.generation import images, jobs, s2f
from app.generation.engine import ENGINE, Engine, EngineError, _frames
with patch("app.jobs.threading.Thread"):
    from app.main import app, jobs as training_jobs


class GenerationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # The worker is deliberately disabled: tests drive each fake generation explicitly.
        with patch.object(jobs.threading, "Thread"):
            jobs.init()
        cls.client = TestClient(app, client=("127.0.0.1", 50000), base_url="http://localhost")

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        training_jobs._lease.close()
        TEMP.cleanup()

    def sketch(self):
        return Image.new("RGB", (64, 64), "white")

    def test_routes_are_namespaced(self):
        self.assertEqual(self.client.get("/api/jobs").json(), [])
        options = self.client.get("/api/generate/options")
        self.assertEqual(options.status_code, 200)
        self.assertEqual(options.json()["characters"], ["Alpha", "Beta"])
        self.assertEqual(self.client.get("/api/generate/jobs").status_code, 200)

    def test_api_validation_and_private_access(self):
        self.assertEqual(self.client.post("/api/generate/jobs", data={"params": "[]"}).status_code, 400)
        response = self.client.post("/api/generate/jobs", data={"params": json.dumps({"mode": "s2f", "characters": ["Alpha"]})}, files={"sketch": ("bad.png", b"invalid", "image/png")})
        self.assertEqual(response.status_code, 400)
        outsider = TestClient(app, client=("192.168.1.100", 50000), base_url="http://localhost")
        self.assertEqual(outsider.get("/api/generate/jobs").status_code, 401)
        self.assertEqual(outsider.get("/api/generate/options", headers={"Origin": "https://example.com"}).status_code, 403)

    def test_references_and_caption_order(self):
        self.assertEqual(s2f.reference(["Alpha", "Beta"]).size, images.SIZE)
        prompt = s2f.caption(["Beta", "Alpha"], chibi=True, scene="talking", expression="happy")
        self.assertLess(prompt.index("Beta"), prompt.index("Alpha"))
        self.assertLess(prompt.index("Scene:"), prompt.index("Expression:"))
        self.assertIn("chibi style.", prompt)

    def test_batch_pipeline_zip_relineart_and_retry(self):
        final = ROOT / "final.png"
        im = Image.new("RGB", images.SIZE, (18, 194, 0))
        ImageDraw.Draw(im).rectangle((200, 200, 550, 1100), fill="orange", outline="black", width=8)
        im.save(final)
        batch, ids = jobs.create_batch("test", [({"characters": ["Alpha", "Beta"], "sizes": ["2k"]}, self.sketch(), "panel.png")])
        with patch.object(ENGINE, "state", "ready"), patch.object(ENGINE, "generate", return_value=str(final)), patch.object(jobs, "upscale4x", side_effect=lambda image: image.copy()):
            jobs._run(jobs.get(ids[0]))
        result = jobs.get(ids[0])
        self.assertEqual(result["status"], "done")
        self.assertTrue({"final", "lineart", "final_2k", "lineart_2k"} <= result["files"].keys())
        self.assertTrue((jobs.outputs_dir(batch) / "panel/caption.txt").exists())
        relineart = self.client.post(f"/api/generate/jobs/{ids[0]}/lineart", json={"stroke_px": 3.4, "fills": True})
        self.assertEqual(relineart.status_code, 200)
        self.assertTrue(relineart.json()["params"]["lineart_fills"])
        self.assertTrue(all(url.startswith("/api/generate/") for url in relineart.json()["urls"].values()))
        archive = self.client.get(f"/api/generate/batches/{batch}/zip")
        self.assertEqual(archive.status_code, 200)
        self.assertTrue(archive.content.startswith(b"PK"))
        retry = jobs.derive(ids[0], {}, "all")
        self.assertEqual(jobs.get(retry)["batch"], batch)
        self.assertTrue(jobs.cancel(retry))

    def test_legacy_two_stage_pipeline(self):
        p = jobs.resolve_params({"characters": ["Alpha"], "seed": 4})
        jid = jobs.create(p, sketch=self.sketch())
        final = ROOT / "legacy.png"
        self.sketch().save(final)
        with patch.object(ENGINE, "state", "ready"), patch.object(ENGINE, "generate", return_value=str(final)) as generate, patch.object(jobs, "upscale4x", side_effect=lambda image: image.copy()):
            jobs._run(jobs.get(jid))
        self.assertEqual(generate.call_count, 2)
        self.assertEqual(jobs.get(jid)["status"], "done")

    def test_generation_waits_for_training_lease(self):
        jid = jobs.create(jobs.resolve_s2f({"characters": ["Alpha"]}), sketch=self.sketch())
        started = threading.Event()
        with gpu.lease:
            with patch.object(jobs, "_run_generation", side_effect=lambda job: started.set()):
                worker = threading.Thread(target=jobs._run, args=(jobs.get(jid),))
                worker.start()
                self.assertFalse(started.wait(.1))
            # Keep the fake implementation until the waiting worker exits.
            with patch.object(jobs, "_run_generation", side_effect=lambda job: started.set()):
                gpu.lease.release()
                try:
                    worker.join(timeout=5)
                finally:
                    gpu.lease.acquire()
        self.assertTrue(started.is_set())
        jobs.cancel(jid)

    def test_training_stops_engine_before_starting(self):
        with patch.object(ENGINE, "stop") as stop, patch.object(training_jobs, "_run_training", side_effect=lambda job: self.assertEqual(gpu.owner, "training")) as run:
            training_jobs._run({"id": "test"})
        stop.assert_called_once()
        run.assert_called_once()
        self.assertIsNone(gpu.owner)

    def test_checkpoint_handoff(self):
        fake = {"id": "abc", "name": "synthetic", "model": "qwen_image_2"}
        checkpoint = run / "test_000001750.safetensors"
        with patch.object(training_jobs, "get", return_value=fake), patch.object(training_jobs, "outputs", return_value={"checkpoints": [{"file": checkpoint.name}]}), patch.object(training_jobs, "output_file", return_value=checkpoint):
            response = self.client.post("/api/generate/checkpoint", json={"job_id": "abc", "file": checkpoint.name})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(s2f.pick_checkpoint()["id"], response.json()["checkpoint"])
            self.assertEqual(self.client.post("/api/generate/checkpoint", json={"job_id": "abc", "file": "../outside.safetensors"}).status_code, 400)
        with patch.object(training_jobs, "get", return_value={**fake, "model": "anima"}):
            self.assertEqual(self.client.post("/api/generate/checkpoint", json={"job_id": "abc", "file": checkpoint.name}).status_code, 400)

    def test_fragmented_engine_frames(self):
        header = json.dumps({"type": "progress", "step": 4}).encode()
        data = struct.pack("<I", len(header)) + header + struct.pack("<Q", 0)
        self.assertEqual(list(_frames([data[i:i+1] for i in range(len(data))]))[0]["step"], 4)
        with self.assertRaises(EngineError):
            list(_frames([data[:-1]]))

    def test_publish_guard(self):
        from scripts.check_publish import problems
        for name in ("studio-data/generation/jobs/a.json", "data/test.txt", "weights.safetensors", "private.png", ".env"):
            self.assertIsNotNone(problems(name, b"test"))
        self.assertIsNone(problems("frontend/app/models/page.tsx", b"export default function Page() {}"))
        self.assertIsNotNone(problems("credentials.json", b'{"api_key":"private"}'))


if __name__ == "__main__":
    unittest.main(verbosity=2)
