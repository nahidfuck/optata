# make_fixtures.py — у корені backend
from PIL import Image
import os

Image.new("RGB", (400, 500), (200, 120, 60)).save("small.jpg", quality=85)
Image.new("L", (6000, 6000)).save("bomb.png", optimize=True)          # 36MP, кілька КБ
Image.effect_noise((3000, 3000), 60).convert("RGB").save("big.jpg", quality=95)

for f in ("small.jpg", "bomb.png", "big.jpg"):
    print(f, os.path.getsize(f) // 1024, "KB")