from ultralytics import YOLO
from pathlib import Path


print("Loading trained GreenEye litter model...")

model = YOLO(
    "models/greeneye_litter.pt"
)

print("Model loaded successfully.")


test_folder = Path(
    "datasets/greeneye-litter/test/images"
)

images = list(test_folder.glob("*.jpg"))

if not images:
    images = list(test_folder.glob("*.jpeg"))

if not images:
    images = list(test_folder.glob("*.png"))


print(f"Found {len(images)} test images.")


# Test only the first 10 images
images = images[:10]


print(f"Testing {len(images)} images...")


results = model(
    [str(image) for image in images],
    conf=0.25,
    imgsz=640,
    save=True
)


for image, result in zip(images, results):

    print()
    print("Image:", image.name)

    if result.boxes is None or len(result.boxes) == 0:

        print("  No litter detected.")

        continue


    for box in result.boxes:

        class_id = int(box.cls[0])

        confidence = float(box.conf[0])

        class_name = result.names[class_id]

        print(
            f"  {class_name}: "
            f"{confidence:.2f}"
        )


print()
print("GreenEye litter model test completed.")