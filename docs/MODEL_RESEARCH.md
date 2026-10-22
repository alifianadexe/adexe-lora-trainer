# Model/workflow research — 2026-10-17

| Choice | Studio support | Source |
|---|---|---|
| Qwen-Image 2.1 | Existing preset and paired config imports; project's current baseline | https://ostris.com/docs/ai-toolkit/models |
| Anima Base | Existing anime/illustration LoRA preset | https://ostris.com/docs/ai-toolkit/models |
| FLUX.2 Klein Base 4B | New LoRA preset; optional conditioning; backend source present, no model benchmark performed | https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4B |
| Z-Image Base | New text-to-image LoRA preset; backend source present, no model benchmark performed | https://huggingface.co/Tongyi-MAI/Z-Image |
| Qwen-Image-Edit-2511 | Linked research candidate; not a wizard preset | https://huggingface.co/Qwen/Qwen-Image-Edit-2511 |

Klein Base is the undistilled fine-tuning choice, with reference-image editing capability. The Base 4B release uses Apache 2.0. Z-Image Base is distinct from Turbo; the preset does not silently reuse Turbo's training adapter. Inference memory claims from model cards are not training-memory guarantees.

Primary backend references:
- https://ostris.com/docs/ai-toolkit/models/flux2-klein-4b
- https://ostris.com/docs/ai-toolkit/models/zimage
- https://github.com/ostris/ai-toolkit

## Methods
LoRA adapts a pretrained base with small trainable matrices. Full fine-tuning updates base weights and requires an appropriate backend config and memory budget; it can be monitored via config import. From-scratch training is a separate research project, not offered as an executable mode here. MoE is an architecture with routing/expert choices, not a LoRA optimizer toggle. PEFT supports targeting expert parameters in compatible architectures, but this studio does not provide a MoE trainer.
Source: https://huggingface.co/docs/peft/package_reference/lora

## Direct sketch → final
A direct paired-editing experiment is feasible to investigate, not a promise of superior quality. Align sketch and final from the same panel, preserve character references, describe action/expression/clothing/color in captions, and use a separate eval split. Compare against the two-stage baseline with the same held-out sketches, prompts, and seed. A style LoRA trained only on final images does not establish sketch conditioning.

No new weights were downloaded, no new training session was launched, and no memory/performance benchmark was performed during this implementation.
