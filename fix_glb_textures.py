from pygltflib import GLTF2
import os

input_glb = "public/Parking.glb"
output_glb = "public/Parking_fixed.glb"
new_texture_folder = "textures/"  # 🔥 这里去掉前面的 /

gltf = GLTF2().load(input_glb)

for i, image in enumerate(gltf.images):
    if image.uri:
        old_uri = image.uri
        filename = os.path.basename(old_uri)
        new_uri = f"{new_texture_folder}{filename}"
        image.uri = new_uri
        print(f"✅ Fixed texture {i}: {old_uri} → {new_uri}")

gltf.save(output_glb)
print(f"\n🎉 Done! Saved as: {output_glb}")