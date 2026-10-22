"""4x anime upscale with RealESRGAN_x4plus_anime_6B (RRDBNet, 6 blocks), tiled,
without the basicsr dependency."""
import threading

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

from .settings import CFG, path


class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, num_block=6, nf=64, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


_model = None
_lock = threading.Lock()


def _load():
    global _model
    if _model is None:
        sd = torch.load(str(path(CFG["upscaler"])), map_location="cpu", weights_only=True)
        sd = sd.get("params_ema", sd.get("params", sd))
        net = RRDBNet()
        net.load_state_dict(sd, strict=True)
        net.eval()
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        net = net.to(dev)
        if dev == "cuda":
            net = net.half()
        _model = net
    return _model


@torch.inference_mode()
def upscale4x(im: Image.Image, tile=384, pad=16) -> Image.Image:
    with _lock:
        net = _load()
        dev = next(net.parameters()).device
        dtype = next(net.parameters()).dtype
        x = torch.from_numpy(np.array(im.convert("RGB"), copy=True)).permute(2, 0, 1).float().div(255).unsqueeze(0)
        _, _, h, w = x.shape
        out = torch.zeros(1, 3, h * 4, w * 4)
        for y0 in range(0, h, tile):
            for x0 in range(0, w, tile):
                y1, x1 = min(y0 + tile, h), min(x0 + tile, w)
                py0, px0 = max(y0 - pad, 0), max(x0 - pad, 0)
                py1, px1 = min(y1 + pad, h), min(x1 + pad, w)
                patch = x[:, :, py0:py1, px0:px1].to(dev, dtype)
                res = net(patch).float().cpu()
                oy, ox = (y0 - py0) * 4, (x0 - px0) * 4
                out[:, :, y0 * 4:y1 * 4, x0 * 4:x1 * 4] = res[:, :, oy:oy + (y1 - y0) * 4, ox:ox + (x1 - x0) * 4]
        if dev.type == "cuda":
            torch.cuda.empty_cache()
        arr = out.squeeze(0).clamp(0, 1).mul(255).round().byte().permute(1, 2, 0).numpy()
        return Image.fromarray(arr)


def release():
    """Return the resident upscaler's GPU allocation before training."""
    global _model
    with _lock:
        _model = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
